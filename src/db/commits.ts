import { inArray, count, and, sql, eq } from "drizzle-orm";

import type { Commit } from "../lib/repo/git";
import type { Db } from "./index";

import { commits } from "./schema";

const CHUNK = 100;
const LOOKUP = 500;

export type SaveResult = { inserted: number; existing: number; updated: number };

type Known = { branchSource: string | null; branch: string | null };

async function lookup(db: Db, projectId: string, list: Commit[]): Promise<Map<string, Known>> {
  const known = new Map<string, Known>();
  for (let i = 0; i < list.length; i += LOOKUP) {
    const hashes = list.slice(i, i + LOOKUP).map((c) => c.hash);
    const rows = await db
      .select({
        branchSource: commits.branchSource,
        branch: commits.branch,
        hash: commits.hash
      })
      .from(commits)
      .where(and(eq(commits.projectId, projectId), inArray(commits.hash, hashes)));
    for (const row of rows) known.set(row.hash, row);
  }
  return known;
}

const learned = (commit: Commit, old: Known) =>
  Boolean((commit.branch && commit.branch !== old.branch) || (commit.branchSource && commit.branchSource !== old.branchSource));

export async function saveCommits(db: Db, projectId: string, list: Commit[]): Promise<SaveResult> {
  const known = await lookup(db, projectId, list);

  const fresh = list.filter((c) => !known.has(c.hash));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const rows = fresh.slice(i, i + CHUNK).map((commit) => ({ ...commit, projectId }));
    const saved = await db
      .insert(commits)
      .values(rows)
      .onConflictDoNothing({ target: [commits.projectId, commits.hash] })
      .returning({ id: commits.id });
    inserted += saved.length;
  }

  let updated = 0;
  for (const commit of list) {
    const old = known.get(commit.hash);
    if (!old || !learned(commit, old)) continue;
    await db
      .update(commits)
      .set({
        branchSource: commit.branchSource ?? old.branchSource,
        branch: commit.branch ?? old.branch
      })
      .where(and(eq(commits.projectId, projectId), eq(commits.hash, commit.hash)));
    updated++;
  }
  return { existing: known.size, inserted, updated };
}

export async function lastSyncedAt(db: Db, projectId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<number | null>`max(cast(strftime('%s', ${commits.committedAt}) as integer))` })
    .from(commits)
    .where(eq(commits.projectId, projectId));
  return row?.at ? new Date(Number(row.at) * 1000) : null;
}

export async function countCommits(db: Db, projectId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(commits).where(eq(commits.projectId, projectId));
  return row?.total ?? 0;
}
