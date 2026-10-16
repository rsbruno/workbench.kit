import { spinner, note } from "@clack/prompts";

import type { MonthCommit } from "../../db/commits";
import type { Project } from "../../db/schema";

import { lengthError, type Draft, countChars, draftDaily, MIN_CHARS, MAX_CHARS } from "./generate";
import { chooseMonth, dateOf, plural, keyOf, label } from "../month";
import { createDailies, listDailies } from "../../db/dailies";
import { requireAgent, type Agent } from "../../lib/config";
import { summary, info, warn } from "../../ui/summary";
import { askConfirm, askText } from "../../ui/prompt";
import { listCommitsOfMonth } from "../../db/commits";
import { defineCommand } from "../../lib/command";
import { brDay } from "../../lib/repo/dates";
import { bold, dim } from "../../ui/color";
import { resolveProject } from "./shared";
import { withDb } from "../../db";

const CONCURRENCY = 3;
type Pending = { commits: MonthCommit[]; date: Date; key: string };
type Reviewed = { date: Date; text: string };

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
    warn(`${brDay(day.date)}: ${draft.note} (no terminal, day skipped)`);
    return undefined;
  }
  warn(`${brDay(day.date)}: ${draft.note}`);
  const text = await askText(
    `Write the daily of ${brDay(day.date)} (${MIN_CHARS} to ${MAX_CHARS} characters; empty skips the day)`,
    {
      validate: (v) => (v ? lengthError(v) : undefined),
      initial: draft.initial
    }
  );
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
  progress.start(`Generating with ${agent} · 0/${days.length}`);
  try {
    const drafts = await pool(days, CONCURRENCY, async (day) => {
      const draft = await draftDaily(agent, project.name, day.commits);
      progress.message(`Generating with ${agent} · ${++done}/${days.length}`);
      return draft;
    });
    progress.stop(`${plural(days.length, "day processed", "days processed")} by ${agent}`);
    return drafts;
  } catch (error) {
    progress.error("Could not generate the dailies");
    throw error;
  }
}

export const sync = defineCommand({
  run: async (_args, flags) => {
    const agent = requireAgent();
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
      return info(`no saved commits for ${label(period)} in "${project.name}". Run first: workbench commits explore`);
    }
    const days = pendingDays(commits, existing);
    if (!days.length) return info(`all dailies of ${label(period)} already exist in "${project.name}"`);

    summary(
      `${plural(days.length, "day without a daily", "days without a daily")} · ${label(period)}`,
      days.map((d) => ({ detail: plural(d.commits.length, "commit", "commits"), name: brDay(d.date) }))
    );

    info(`sending the commits of ${plural(days.length, "day", "days")} to ${agent}: the commit messages leave your machine`);
    const drafts = await generateAll(agent, project, days);

    const reviewed: Reviewed[] = [];
    for (const [i, day] of days.entries()) {
      const draft = drafts[i]!;
      const text = draft.text ?? (await writeByHand(day, draft));
      if (text) reviewed.push({ date: day.date, text });
    }
    if (!reviewed.length) return info("no daily to save");

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
      { detail: project.name, name: "project" },
      { detail: label(period), name: "month" },
      { detail: String(created), name: "criadas" },
      ...(skipped ? [{ detail: String(skipped), name: "already existed" }] : []),
      ...(reviewed.length < days.length ? [{ detail: String(days.length - reviewed.length), name: "puladas" }] : [])
    ]);
  },
  description:
    "fill the days without a daily from your saved commits: sync [--project] [--month MM/YYYY] (the AI agent comes from workbench config agent)",
  name: "sync"
});
