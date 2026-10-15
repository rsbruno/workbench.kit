import type { TimeEntry, Project, Daily } from "../../db/schema";
import type { Flags } from "../../lib/command";

import { type Shift, TimeKind, overlap, SHIFTS } from "../../lib/repo/clock";
import { listProjects, findProject } from "../../db/projects";
import { listDailies } from "../../db/dailies";
import { listTimes } from "../../db/times";
import { withDb } from "../../db";

export type Entry = { times: TimeEntry[]; project: Project; daily: Daily };
export type Split = { overtime: number; regular: number };
export type Day = Split & { shifts: Record<Shift["key"], Split>; entries: Entry[]; date: Date };

const MONTH = /^(\d{1,2})\/(\d{4})$/;

export const length = (t: TimeEntry) => t.endMinute - t.startMinute;
export const sum = (times: TimeEntry[], kind: TimeKind) =>
  times.filter((t) => t.kind === kind).reduce((total, t) => total + length(t), 0);

export function parseMonth(input: string | undefined): { month: number; year: number } {
  if (!input) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  const m = MONTH.exec(input.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new Error("mês inválido: use MM/AAAA (ex.: 10/2026)");
  return { month: Number(m[1]) - 1, year: Number(m[2]) };
}

function shiftSplit(times: TimeEntry[], shift: Shift): Split {
  const minutes = (kind: TimeKind) =>
    times.filter((t) => t.kind === kind).reduce((total, t) => total + overlap(t.startMinute, t.endMinute, shift), 0);
  return { overtime: minutes(TimeKind.OVERTIME), regular: minutes(TimeKind.REGULAR) };
}

export async function load(flags: Flags, month: number, year: number): Promise<Day[]> {
  return withDb(async (db) => {
    const project = flags.project?.trim() ? await findProject(db, flags.project) : undefined;
    const projects = new Map((await listProjects(db)).map((p) => [p.id, p]));
    const first = new Date(year, month, 1);
    const next = new Date(year, month + 1, 1);
    const dailies = (await listDailies(db, project?.id)).filter((d) => d.day >= first && d.day < next);
    const times = await listTimes(
      db,
      dailies.map((d) => d.id)
    );

    const days: Day[] = [];
    for (let date = new Date(first); date < next; date.setDate(date.getDate() + 1)) {
      const at = new Date(date);
      const entries: Entry[] = dailies
        .filter((d) => d.day.getTime() === at.getTime())
        .map((daily) => ({
          times: times.filter((t) => t.dailyId === daily.id).sort((a, b) => a.startMinute - b.startMinute),
          project: projects.get(daily.projectId)!,
          daily
        }));
      const all = entries.flatMap((e) => e.times);
      days.push({
        shifts: Object.fromEntries(SHIFTS.map((shift) => [shift.key, shiftSplit(all, shift)])) as Day["shifts"],
        overtime: sum(all, TimeKind.OVERTIME),
        regular: sum(all, TimeKind.REGULAR),
        date: at,
        entries
      });
    }
    return days;
  });
}
