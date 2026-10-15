import { isCancel, cancel, text } from "@clack/prompts";

import type { Project } from "../../db/schema";

import { collectCommits, assertRepo, readEmail, repoRoot } from "../../lib/repo/git";
import { type Option, askConfirm, selectOne } from "../../ui/prompt";
import { parsePtBrDate, dateError } from "../../lib/repo/dates";
import { listProjects, findProject } from "../../db/projects";
import { defineCommand, type Flags } from "../../lib/command";
import { lastSyncedAt, saveCommits } from "../../db/commits";
import { matchProjects } from "../../lib/repo/match";
import { groupByDay } from "../../lib/repo/group";
import { summary, info } from "../../ui/summary";
import { withDb } from "../../db";

const OTHER = "other";

function flagDate(name: string, value: string) {
  const date = parsePtBrDate(value);
  if (!date) throw new Error(`--${name}: ${dateError(value) ?? "data inválida"}`);
  return date;
}

async function askSince(): Promise<string | undefined> {
  const answer = await text({
    message: "A partir de qual data? (DD/MM/AAAA, opcional)",
    placeholder: "em branco = todo o histórico",
    validate: (value) => dateError(value ?? "")
  });
  if (isCancel(answer)) {
    cancel("cancelled");
    process.exit(130);
  }
  return answer.trim() ? flagDate("since", answer) : undefined;
}

type Since = { origin: "flag" | "sync" | "prompt" | "all"; date: string | undefined; at?: Date };

async function resolveSince(flags: Flags, interactive: boolean, lastSynced: Date | null): Promise<Since> {
  if (flags.since) return { date: flagDate("since", flags.since), origin: "flag" };
  if (lastSynced) return { date: `${lastSynced.toISOString().slice(0, 19)}Z`, origin: "sync", at: lastSynced };
  if (interactive) {
    const asked = await askSince();
    return { origin: asked ? "prompt" : "all", date: asked };
  }
  return { date: undefined, origin: "all" };
}

const br = (iso: string) => iso.split("-").reverse().join("/");

function describeSince({ origin, date, at }: Since) {
  if (!date) return "buscando o histórico inteiro (primeira sincronização)";
  if (origin === "sync" && at) {
    return `buscando desde ${at.toLocaleString("pt-BR", { timeStyle: "medium", dateStyle: "short" })} (último commit sincronizado)`;
  }
  return `buscando desde ${br(date)} (${origin === "flag" ? "--since" : "data informada"})`;
}

async function pickFrom(projects: Project[], message: string): Promise<Project> {
  if (!projects.length) throw new Error("nenhum projeto cadastrado; crie com: workbench projects add");
  const id = await selectOne(
    message,
    projects.map((p) => ({ detail: p.path || "incompleto", name: p.name, value: p.id }))
  );
  return projects.find((p) => p.id === id)!;
}

async function pickAmong(matches: Project[], all: Project[]): Promise<Project> {
  const options: Option<string>[] = [
    ...matches.map((p) => ({ detail: p.path, name: p.name, value: p.id })),
    { name: "Outro projeto…", value: OTHER }
  ];
  const id = await selectOne("Mais de um projeto corresponde a esta pasta. Qual explorar?", options);
  return id === OTHER ? pickFrom(all, "Qual projeto explorar?") : matches.find((p) => p.id === id)!;
}

async function chooseProject(flags: Flags, interactive: boolean): Promise<Project> {
  return withDb(async (db) => {
    if (flags.project) return findProject(db, flags.project);

    const all = await listProjects(db);
    const cwd = process.cwd();
    const found = matchProjects(all, (await repoRoot(cwd)) ?? cwd);

    if (!interactive) {
      if (found.length === 1) return found[0]!;
      throw new Error(
        found.length
          ? "mais de um projeto corresponde a esta pasta; use --project <nome|id>"
          : "nenhum projeto corresponde a esta pasta; use --project <nome|id>"
      );
    }

    if (found.length === 1) {
      const project = found[0]!;
      if (await askConfirm(`Projeto encontrado: "${project.name}". Explorar este projeto?`, true)) return project;
      return pickFrom(all, "Qual projeto explorar?");
    }
    if (found.length > 1) return pickAmong(found, all);

    info("nenhum projeto corresponde a esta pasta");
    return pickFrom(all, "Qual projeto explorar?");
  });
}

export const explore = defineCommand({
  run: async (_args, flags) => {
    const interactive = Boolean(process.stdin.isTTY) && !flags.json;
    const project = await chooseProject(flags, interactive);
    if (!project.path) throw new Error(`o projeto "${project.name}" está incompleto: rode workbench projects update`);

    const cwd = project.path;
    await assertRepo(cwd).catch(() => {
      throw new Error(`a pasta do projeto "${project.name}" não é um repositório git: ${cwd}`);
    });
    const email = await readEmail(cwd);
    const lastSynced = await withDb((db) => lastSyncedAt(db, project.id));
    const since = await resolveSince(flags, interactive, lastSynced);
    const until = flags.until ? flagDate("until", flags.until) : undefined;

    const commits = await collectCommits({ since: since.date, until, email, cwd });
    const saved = await withDb((db) => saveCommits(db, project.id, commits));

    if (flags.json) return void process.stdout.write(`${JSON.stringify(commits, null, 2)}\n`);
    info(`projeto "${project.name}" · ${cwd}`);
    info(describeSince(since));
    if (!commits.length) return info(`no commits for ${email}`);

    const days = groupByDay(commits);
    for (const { commits: list, day } of days) {
      const rows = list.map((c) => ({ name: `${c.authoredAt.slice(11, 16)}  ${c.hash.slice(0, 7)}`, detail: c.subject }));
      summary(`${day} · ${list.length}`, rows);
    }
    info(`${commits.length} commits · ${days.length} days · ${email}`);
    info(`salvos: ${saved.inserted} novos, ${saved.existing} já existiam, ${saved.updated} atualizados`);
  },
  description: "list your commits of a project (matched from the current folder), grouped by day",
  aliases: ["ex"],
  name: "explore"
});
