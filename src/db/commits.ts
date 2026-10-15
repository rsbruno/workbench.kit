import { inArray, count, and, sql, gte, eq, lt } from "drizzle-orm";

import type { Commit } from "../lib/repo/git";
import type { Db } from "./index";

import { type CommitRow, commits } from "./schema";

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

export type MonthCommit = Pick<
  CommitRow,
  "deletions" | "insertions" | "filesChanged" | "authoredAt" | "subject" | "branch" | "body" | "type" | "day"
>;

/** Commits saved for a project in a month (0-based month), oldest first. `day` is the local YYYY-MM-DD. */
export async function listCommitsOfMonth(db: Db, projectId: string, year: number, month: number): Promise<MonthCommit[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(month + 1)}-01`;
  const next = month === 11 ? `${year + 1}-01-01` : `${year}-${pad(month + 2)}-01`;
  return db
    .select({
      filesChanged: commits.filesChanged,
      insertions: commits.insertions,
      authoredAt: commits.authoredAt,
      deletions: commits.deletions,
      subject: commits.subject,
      branch: commits.branch,
      body: commits.body,
      type: commits.type,
      day: commits.day
    })
    .from(commits)
    .where(and(eq(commits.projectId, projectId), gte(commits.day, first), lt(commits.day, next)))
    .orderBy(commits.authoredAt);
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
