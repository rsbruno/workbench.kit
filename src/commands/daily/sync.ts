import { spinner, note } from "@clack/prompts";

import type { MonthCommit } from "../../db/commits";
import type { Project } from "../../db/schema";
import type { Flags } from "../../lib/command";

import { lengthError, type Draft, countChars, draftDaily, MIN_CHARS, MAX_CHARS } from "./generate";
import { askConfirm, selectOne, askText } from "../../ui/prompt";
import { createDailies, listDailies } from "../../db/dailies";
import { type Agent, readConfig } from "../../lib/config";
import { capitalize, MONTHS } from "../timesheet/style";
import { summary, info, warn } from "../../ui/summary";
import { listCommitsOfMonth } from "../../db/commits";
import { defineCommand } from "../../lib/command";
import { parseMonth } from "../timesheet/data";
import { brDay } from "../../lib/repo/dates";
import { bold, dim } from "../../ui/color";
import { resolveProject } from "./shared";
import { withDb } from "../../db";

const CONCURRENCY = 3;
const MONTH_CHOICES = 12;
const OTHER = "other";

type Month = { month: number; year: number };
type Pending = { commits: MonthCommit[]; date: Date; key: string };
type Reviewed = { date: Date; text: string };

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateOf = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
};
const label = ({ month, year }: Month) => `${capitalize(MONTHS[month]!)}/${year}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function chooseMonth(flags: Flags): Promise<Month> {
  if (flags.month?.trim()) return parseMonth(flags.month);

  const now = new Date();
  const recent = Array.from({ length: MONTH_CHOICES }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const picked = await selectOne("Mês de referência", [
    ...recent.map((m) => ({
      detail: m.year === now.getFullYear() && m.month === now.getMonth() ? "mês atual" : undefined,
      value: `${pad(m.month + 1)}/${m.year}`,
      name: label(m)
    })),
    { name: "Outro mês…", value: OTHER }
  ]);
  if (picked !== OTHER) return parseMonth(picked);
  return parseMonth(
    await askText("Mês de referência (MM/AAAA)", {
      validate: (v) => {
        try {
          parseMonth(v || undefined);
          return v ? undefined : "informe o mês";
        } catch (e) {
          return (e as Error).message;
        }
      }
    })
  );
}

/** The agent only comes from the settings; there is no prompt for it here. */
function configuredAgent(): Agent {
  const agent = readConfig().agent;
  if (!agent) {
    throw new Error(
      `nenhum agente de IA configurado. Defina com: workbench config agent claude (ou codex), ou rode workbench config para escolher`
    );
  }
  return agent;
}

function pendingDays(commits: MonthCommit[], existing: Set<string>): Pending[] {
  const byDay = new Map<string, MonthCommit[]>();
  for (const commit of commits) byDay.set(commit.day, [...(byDay.get(commit.day) ?? []), commit]);
  return [...byDay]
    .filter(([key]) => !existing.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ date: dateOf(key), commits: list, key }));
}

/** Runs `fn` over the items with a limited number of calls at once; stops taking new ones after the first error. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (failure === undefined && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure !== undefined) throw failure;
  return results;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}

async function writeByHand(day: Pending, draft: Draft): Promise<string | undefined> {
  if (!process.stdin.isTTY) {
    warn(`${brDay(day.date)}: ${draft.note} (sem terminal, dia pulado)`);
    return undefined;
  }
  warn(`${brDay(day.date)}: ${draft.note}`);
  const text = await askText(`Escreva a daily de ${brDay(day.date)} (${MIN_CHARS} a ${MAX_CHARS} caracteres; vazio pula o dia)`, {
    validate: (v) => (v ? lengthError(v) : undefined),
    initial: draft.initial
  });
  return text || undefined;
}

function preview(reviewed: Reviewed[]) {
  const width = Math.max(40, Math.min((process.stdout.columns ?? 80) - 10, 100));
  const lines = reviewed.flatMap(({ date, text }, i) => [
    ...(i ? [""] : []),
    `${bold(brDay(date))}${dim(`  ·  ${countChars(text)} caracteres`)}`,
    ...wrap(text, width)
  ]);
  note(lines.join("\n"), `dailies geradas · ${reviewed.length}`);
}

async function generateAll(agent: Agent, project: Project, days: Pending[]): Promise<Draft[]> {
  const progress = spinner();
  let done = 0;
  progress.start(`Gerando com o ${agent} · 0/${days.length}`);
  try {
    const drafts = await pool(days, CONCURRENCY, async (day) => {
      const draft = await draftDaily(agent, project.name, day.commits);
      progress.message(`Gerando com o ${agent} · ${++done}/${days.length}`);
      return draft;
    });
    progress.stop(`${plural(days.length, "dia processado", "dias processados")} pelo ${agent}`);
    return drafts;
  } catch (error) {
    progress.error("Não foi possível gerar as dailies");
    throw error;
  }
}

export const sync = defineCommand({
  run: async (_args, flags) => {
    const agent = configuredAgent();
    const { existing, project, commits, period } = await withDb(async (db) => {
      const project = await resolveProject(db, flags);
      const period = await chooseMonth(flags);
      const first = new Date(period.year, period.month, 1);
      const next = new Date(period.year, period.month + 1, 1);
      const existing = new Set(
        (await listDailies(db, project.id)).filter((d) => d.day >= first && d.day < next).map((d) => keyOf(d.day))
      );
      return { commits: await listCommitsOfMonth(db, project.id, period.year, period.month), existing, project, period };
    });

    if (!commits.length) {
      return info(`nenhum commit salvo de ${label(period)} para "${project.name}". Rode antes: workbench commits explore`);
    }
    const days = pendingDays(commits, existing);
    if (!days.length) return info(`todas as dailies de ${label(period)} já existem em "${project.name}"`);

    summary(
      `${plural(days.length, "dia sem daily", "dias sem daily")} · ${label(period)}`,
      days.map((d) => ({ detail: plural(d.commits.length, "commit", "commits"), name: brDay(d.date) }))
    );

    info(`enviando os commits de ${plural(days.length, "dia", "dias")} ao ${agent}: as mensagens de commit saem da sua máquina`);
    const drafts = await generateAll(agent, project, days);

    const reviewed: Reviewed[] = [];
    for (const [i, day] of days.entries()) {
      const draft = drafts[i]!;
      const text = draft.text ?? (await writeByHand(day, draft));
      if (text) reviewed.push({ date: day.date, text });
    }
    if (!reviewed.length) return info("nenhuma daily para gravar");

    preview(reviewed);
    const ask = `Gravar ${plural(reviewed.length, "daily", "dailies")} em "${project.name}"?`;
    if (!flags.force && !(await askConfirm(ask, true))) return info("cancelado");

    const { created, skipped } = await withDb((db) =>
      createDailies(
        db,
        project.id,
        reviewed.map((r) => ({ content: r.text, day: r.date }))
      )
    );
    summary("dailies gravadas", [
      { detail: project.name, name: "projeto" },
      { detail: label(period), name: "mês" },
      { detail: String(created), name: "criadas" },
      ...(skipped ? [{ detail: String(skipped), name: "já existiam" }] : []),
      ...(reviewed.length < days.length ? [{ detail: String(days.length - reviewed.length), name: "puladas" }] : [])
    ]);
  },
  description:
    "fill the days without a daily from your saved commits: sync [--project] [--month MM/AAAA] (the AI agent comes from workbench config agent)",
  name: "sync"
});
