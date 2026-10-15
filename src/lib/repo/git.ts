import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { type BranchSource, type Graph, attribute } from "./branch";
import { parseMessage } from "./parse";

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;
const FIELD = "\x1f";
const RECORD = "\x1e";

export type Commit = {
  committerEmail: string;
  committerName: string;
  committedAt: string;
  filesChanged: number;
  authorEmail: string;
  branchSource: BranchSource | null;
  branch: string | null;
  authorName: string;
  authoredAt: string;
  insertions: number;
  isBreaking: boolean;
  type: string | null;
  deletions: number;
  treeHash: string;
  subject: string;
  body: string;
  hash: string;
  day: string;
};

export type CollectOptions = { since?: string; until?: string; email: string; cwd: string };

const git = (cwd: string, args: string[]) => run("git", ["-C", cwd, ...args], { maxBuffer: MAX_BUFFER });

let sinceAsFilter: Promise<boolean> | undefined;

// `--since` stops walking at the first commit older than the date, which hides newer ancestors when
// dates are not monotonic (clock skew, rebases). `--since-as-filter` (git >= 2.36) walks everything instead.
async function sinceArg(cwd: string, date: string): Promise<string> {
  sinceAsFilter ??= git(cwd, ["--version"]).then(
    (r) => {
      const [, major = 0, minor = 0] = /(\d+)\.(\d+)/.exec(r.stdout) ?? [];
      return Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 36);
    },
    () => false
  );
  return `${(await sinceAsFilter) ? "--since-as-filter" : "--since"}=${date}`;
}

export async function assertRepo(cwd: string) {
  const inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]).then(
    (r) => r.stdout.trim() === "true",
    () => false
  );
  if (!inside) throw new Error("not inside a git repository");
}

const firstLine = (stdout: string) => stdout.trim() || null;

export const repoRoot = (cwd: string) =>
  git(cwd, ["rev-parse", "--show-toplevel"]).then(
    (r) => firstLine(r.stdout),
    () => null
  );

export const originUrl = (cwd: string) =>
  git(cwd, ["remote", "get-url", "origin"]).then(
    (r) => firstLine(r.stdout),
    () => null
  );

export async function readEmail(cwd: string): Promise<string> {
  const email = await git(cwd, ["config", "user.email"]).then(
    (r) => r.stdout.trim(),
    () => ""
  );
  if (!email) throw new Error("git user.email is not set; run `git config user.email <email>`");
  return email;
}

const FORMAT = ["%H", "%T", "%an", "%ae", "%aI", "%cn", "%ce", "%cI", "%s", "%b", ""].join(FIELD);

const count = (text: string, pattern: RegExp) => Number(pattern.exec(text)?.[1] ?? 0);

type Raw = { titleBranch: string | null; commit: Commit };

function toCommit(record: string): Raw {
  const [
    hash = "",
    treeHash = "",
    authorName = "",
    authorEmail = "",
    authoredAt = "",
    committerName = "",
    committerEmail = "",
    committedAt = "",
    subject = "",
    rawBody = "",
    stat = ""
  ] = record.split(FIELD);
  const body = rawBody.trim();
  const { titleBranch, ...parsed } = parseMessage(subject, body);
  const commit: Commit = {
    ...parsed,
    insertions: count(stat, /(\d+) insertions?\(\+\)/),
    filesChanged: count(stat, /(\d+) files? changed/),
    deletions: count(stat, /(\d+) deletions?\(-\)/),
    day: authoredAt.slice(0, 10),
    branchSource: null,
    committerEmail,
    committerName,
    branch: null,
    committedAt,
    authorEmail,
    authorName,
    authoredAt,
    treeHash,
    subject,
    body,
    hash
  };
  return { titleBranch, commit };
}

const DAY_MS = 86_400_000;

async function readGraph(cwd: string, since: string): Promise<Graph> {
  const [log, refs, head] = await Promise.all([
    git(cwd, ["log", "--branches", "--remotes", await sinceArg(cwd, since), `--format=%H${FIELD}%P${FIELD}%s`]),
    git(cwd, ["for-each-ref", `--format=%(objectname)${FIELD}%(refname)`, "refs/heads", "refs/remotes"]),
    git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => null)
  ]);

  const nodes: Graph["nodes"] = new Map();
  for (const line of log.stdout.split("\n")) {
    const [hash, parents = "", subject = ""] = line.split(FIELD);
    if (hash) nodes.set(hash, { parents: parents.split(" ").filter(Boolean), subject });
  }
  return {
    refs: refs.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", name = ""] = line.split(FIELD);
        return { remote: name.startsWith("refs/remotes/"), name, hash };
      }),
    defaultBranch: head?.stdout.trim().replace(/^origin\//, "") || null,
    nodes
  };
}

async function withBranches(cwd: string, list: Raw[]): Promise<Commit[]> {
  const oldest = Math.min(...list.map((r) => Date.parse(r.commit.authoredAt)));
  const since = new Date(oldest - 30 * DAY_MS).toISOString().slice(0, 10);
  const graph = await readGraph(cwd, since);
  const titles = new Map(list.filter((r) => r.titleBranch).map((r) => [r.commit.hash, r.titleBranch!]));
  const origin = attribute(graph, titles);

  return list.map(({ commit }) => {
    const found = origin.get(commit.hash);
    const branch = found?.branch ?? null;
    return { ...commit, branchSource: found?.source ?? null, branch };
  });
}

export async function collectCommits({ since, until, email, cwd }: CollectOptions): Promise<Commit[]> {
  const args = [
    "log",
    "--branches",
    "--remotes",
    "--no-merges",
    "--shortstat",
    "--fixed-strings",
    "--regexp-ignore-case",
    `--author=${email}`,
    `--format=${RECORD}${FORMAT}`
  ];
  if (since) args.push(await sinceArg(cwd, /^\d{4}-\d{2}-\d{2}$/.test(since) ? `${since} 00:00:00` : since));
  if (until) args.push(`--until=${until} 23:59:59`);

  const out = await git(cwd, args).then(
    (r) => r.stdout,
    (e: Error & { stderr?: string }) => {
      if (/does not have any commits yet|bad default revision/.test(e.stderr ?? "")) return "";
      throw new Error(e.stderr?.trim() || e.message);
    }
  );

  const wanted = email.toLowerCase();
  const list = out
    .split(RECORD)
    .slice(1)
    .map(toCommit)
    .filter((r) => r.commit.authorEmail.toLowerCase() === wanted);
  return list.length ? withBranches(cwd, list) : [];
}
