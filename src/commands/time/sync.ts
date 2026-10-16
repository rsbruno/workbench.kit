import { spinner } from "@clack/prompts";

import type { Daily } from "../../db/schema";

import { totalsOfEntries, type Entry, willSave, review } from "./review";
import { chooseMonth, plural, dateOf, label, keyOf } from "../month";
import { type DayInput, estimateDays } from "./estimate";
import { createTimes, listTimes } from "../../db/times";
import { summary, info, warn } from "../../ui/summary";
import { formatDuration } from "../../lib/repo/clock";
import { listCommitsOfMonth } from "../../db/commits";
import { defineCommand } from "../../lib/command";
import { resolveProject } from "../daily/shared";
import { requireAgent } from "../../lib/config";
import { listDailies } from "../../db/dailies";
import { brDay } from "../../lib/repo/dates";
import { withDb } from "../../db";

const days = (keys: string[]) => keys.map((k) => brDay(dateOf(k))).join(", ");

export const sync = defineCommand({
  run: async (_args, flags) => {
    const agent = requireAgent();
    const loaded = await withDb(async (db) => {
      const project = await resolveProject(db, flags);
      const period = await chooseMonth(flags);
      const first = new Date(period.year, period.month, 1);
      const next = new Date(period.year, period.month + 1, 1);
      const dailies = (await listDailies(db, project.id)).filter((d) => d.day >= first && d.day < next);
      const logged = new Set(
        (
          await listTimes(
            db,
            dailies.map((d) => d.id)
          )
        ).map((t) => t.dailyId)
      );
      return { commits: await listCommitsOfMonth(db, project.id, period.year, period.month), dailies, project, logged, period };
    });
    const { commits, dailies, project, logged, period } = loaded;

    if (!commits.length) {
      return info(`nenhum commit salvo de ${label(period)} para "${project.name}". Rode antes: workbench commits explore`);
    }

    const byDay = new Map<string, typeof commits>();
    for (const commit of commits) byDay.set(commit.day, [...(byDay.get(commit.day) ?? []), commit]);
    const dailyOf = new Map<string, Daily>(dailies.map((d) => [keyOf(d.day), d]));

    const noDaily: string[] = [];
    const hasHours: string[] = [];
    const todo: (DayInput & { daily: Daily })[] = [];
    for (const [key, list] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
      const daily = dailyOf.get(key);
      if (!daily) noDaily.push(key);
      else if (logged.has(daily.id)) hasHours.push(key);
      else todo.push({ date: dateOf(key), commits: list, daily, key });
    }

    if (noDaily.length) info(`sem daily (rode workbench daily sync antes): ${days(noDaily)}`);
    if (hasHours.length) info(`já têm horas (não mexo): ${days(hasHours)}`);
    if (!todo.length) return info(`nenhum dia de ${label(period)} para estimar em "${project.name}"`);

    info(`enviando horários e assuntos dos commits de ${plural(todo.length, "dia", "dias")} ao ${agent}`);
    const progress = spinner();
    progress.start(`Estimando com o ${agent} · 0/${todo.length}`);
    let proposals;
    try {
      proposals = await estimateDays(agent, todo, (done, total) =>
        progress.message(`Estimando com o ${agent} · ${done}/${total}`)
      );
      progress.stop(`${plural(todo.length, "dia estimado", "dias estimados")} pelo ${agent}`);
    } catch (error) {
      progress.error("Não foi possível estimar as horas");
      throw error;
    }

    const entries: Entry[] = proposals.map((p, i) => ({ ...p, daily: todo[i]!.daily, skipped: false }));
    const fallbacks = entries.filter((e) => e.source === "fallback");
    if (flags.force && fallbacks.length === entries.length) {
      throw new Error(
        `o ${agent} não conseguiu estimar nenhum dia, então nada foi gravado (${entries[0]!.reason}). Rode sem --force para revisar, ou confira o agente`
      );
    }
    if (fallbacks.length) warn(`estimativa de reserva (o agente não acertou): ${days(fallbacks.map((e) => e.key))}`);

    const chosen = flags.force ? entries : await review(agent, entries);
    if (!chosen) return info("cancelado");

    const failed: string[] = [];
    for (const entry of chosen.filter(willSave)) {
      try {
        await withDb((db) =>
          createTimes(
            db,
            entry.daily,
            entry.blocks.map((b) => ({ startMinute: b.startMinute, endMinute: b.endMinute, description: "", kind: b.kind }))
          )
        );
      } catch (error) {
        failed.push(`${brDay(entry.date)}: ${(error as Error).message}`);
        entry.skipped = true;
      }
    }

    const saved = totalsOfEntries(chosen);
    const skipped = chosen.length - saved.days - failed.length;
    summary("horas gravadas", [
      { detail: project.name, name: "projeto" },
      { detail: label(period), name: "mês" },
      { detail: String(saved.days), name: "dias" },
      { detail: formatDuration(saved.regular), name: "horas comuns" },
      { detail: formatDuration(saved.extra), name: "horas extras" },
      ...(skipped > 0 ? [{ detail: String(skipped), name: "pulados" }] : []),
      ...(failed.length ? [{ detail: String(failed.length), name: "com conflito" }] : [])
    ]);
    for (const message of failed) warn(message);
  },
  description:
    "estimate the hours of each day from your saved commits and log them: sync [--project] [--month MM/AAAA] [--force]",
  name: "sync"
});
