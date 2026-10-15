import { desc, and, sql, eq } from "drizzle-orm";

import type { Db } from "./index";

import { type Daily, dailies } from "./schema";
import { brDay } from "../lib/repo/dates";

export function cleanContent(input: string): string {
  const content = input.trim();
  if (!content) throw new Error("o texto do apontamento é obrigatório");
  return content;
}

export const listDailies = (db: Db, projectId?: string) =>
  db
    .select()
    .from(dailies)
    .where(projectId ? eq(dailies.projectId, projectId) : undefined)
    .orderBy(desc(dailies.day));

export const findDaily = async (db: Db, projectId: string, day: Date): Promise<Daily | undefined> =>
  db
    .select()
    .from(dailies)
    .where(and(eq(dailies.projectId, projectId), eq(dailies.day, day)))
    .get();

export async function createDaily(db: Db, projectId: string, day: Date, content: string): Promise<Daily> {
  const text = cleanContent(content);
  if (await findDaily(db, projectId, day)) {
    throw new Error(`já existe um apontamento em ${brDay(day)} neste projeto; use update para editar`);
  }
  const [row] = await db.insert(dailies).values({ content: text, projectId, day }).returning();
  return row!;
}

export async function updateDaily(db: Db, current: Daily, content: string): Promise<{ changed: boolean; daily: Daily }> {
  const text = cleanContent(content);
  if (text === current.content) return { daily: current, changed: false };
  const [row] = await db
    .update(dailies)
    .set({ updatedAt: sql`CURRENT_TIMESTAMP`, content: text })
    .where(eq(dailies.id, current.id))
    .returning();
  return { changed: true, daily: row! };
}

export async function deleteDaily(db: Db, id: string) {
  await db.delete(dailies).where(eq(dailies.id, id));
}
