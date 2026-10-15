import { inArray, sql, eq } from "drizzle-orm";

import type { Db } from "./index";

import { type TimeEntry, timeEntries, type Daily, dailies } from "./schema";
import { type TimeKind, DAY_MINUTES, formatClock } from "../lib/repo/clock";

export type TimeInput = { description: string; startMinute: number; endMinute: number; kind: TimeKind };

export type TimePatch = Partial<TimeInput>;

export const listTimes = async (db: Db, dailyIds: string[]): Promise<TimeEntry[]> =>
  dailyIds.length
    ? db.select().from(timeEntries).where(inArray(timeEntries.dailyId, dailyIds)).orderBy(timeEntries.startMinute)
    : [];

export async function countTimes(db: Db, dailyId: string): Promise<number> {
  return (await listTimes(db, [dailyId])).length;
}

async function assertValid(db: Db, daily: Daily, input: TimeInput, exceptId?: string) {
  const { startMinute: start, endMinute: end } = input;
  if (start < 0 || end > DAY_MINUTES || end <= start) throw new Error("a hora de fim deve ser depois da hora de início");

  const sameDay = await db
    .select({ start: timeEntries.startMinute, end: timeEntries.endMinute, id: timeEntries.id })
    .from(timeEntries)
    .innerJoin(dailies, eq(timeEntries.dailyId, dailies.id))
    .where(eq(dailies.day, daily.day));
  const clash = sameDay.find((t) => t.id !== exceptId && t.start < end && t.end > start);
  if (clash) {
    throw new Error(`esse horário conflita com outro lançamento do dia (${formatClock(clash.start)}–${formatClock(clash.end)})`);
  }
}

export async function createTime(db: Db, daily: Daily, input: TimeInput): Promise<TimeEntry> {
  await assertValid(db, daily, input);
  const [row] = await db
    .insert(timeEntries)
    .values({ ...input, description: input.description.trim(), dailyId: daily.id })
    .returning();
  return row!;
}

export async function updateTime(
  db: Db,
  daily: Daily,
  current: TimeEntry,
  patch: TimePatch
): Promise<{ changed: boolean; time: TimeEntry }> {
  const next: TimeInput = {
    description: (patch.description ?? current.description).trim(),
    startMinute: patch.startMinute ?? current.startMinute,
    endMinute: patch.endMinute ?? current.endMinute,
    kind: patch.kind ?? current.kind
  };
  const changed = (Object.keys(next) as (keyof TimeInput)[]).some((key) => next[key] !== current[key]);
  if (!changed) return { time: current, changed };
  await assertValid(db, daily, next, current.id);
  const [row] = await db
    .update(timeEntries)
    .set({ ...next, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(timeEntries.id, current.id))
    .returning();
  return { time: row!, changed };
}

export async function deleteTime(db: Db, id: string) {
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
}
