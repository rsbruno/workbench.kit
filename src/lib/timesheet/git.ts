import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;
const FIELD = "\x1f";
const RECORD = "\x1e";

export type Commit = { author: string; subject: string; email: string; date: string; hash: string };

export type CollectOptions = { since?: string; until?: string; email: string; cwd: string };

const git = (cwd: string, args: string[]) => run("git", ["-C", cwd, ...args], { maxBuffer: MAX_BUFFER });

export async function assertRepo(cwd: string) {
  const inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]).then(
    (r) => r.stdout.trim() === "true",
    () => false
  );
  if (!inside) throw new Error("not inside a git repository");
}

export type RepoInfo = { root: string; path: string };

export async function detectRepo(cwd: string): Promise<RepoInfo | null> {
  const top = await git(cwd, ["rev-parse", "--show-toplevel"]).then(
    (r) => r.stdout.trim(),
    () => ""
  );
  if (!top) return null;
  const roots = await git(cwd, ["rev-list", "--max-parents=0", "HEAD"]).then(
    (r) => r.stdout.split("\n").filter(Boolean),
    () => [] as string[]
  );
  const root = roots.sort()[0];
  return root ? { path: top, root } : null;
}

export async function readEmail(cwd: string): Promise<string> {
  const email = await git(cwd, ["config", "user.email"]).then(
    (r) => r.stdout.trim(),
    () => ""
  );
  if (!email) throw new Error("git user.email is not set; run `git config user.email <email>`");
  return email;
}

export async function collectCommits({ since, until, email, cwd }: CollectOptions): Promise<Commit[]> {
  const args = [
    "log",
    "--branches",
    "--remotes",
    "--no-merges",
    "--fixed-strings",
    "--regexp-ignore-case",
    `--author=${email}`,
    `--format=%H${FIELD}%aI${FIELD}%ae${FIELD}%an${FIELD}%s${RECORD}`
  ];
  if (since) args.push(`--since=${since} 00:00:00`);
  if (until) args.push(`--until=${until} 23:59:59`);

  const out = await git(cwd, args).then(
    (r) => r.stdout,
    (e: Error & { stderr?: string }) => {
      if (/does not have any commits yet|bad default revision/.test(e.stderr ?? "")) return "";
      throw new Error(e.stderr?.trim() || e.message);
    }
  );

  const wanted = email.toLowerCase();
  return out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .map((r) => {
      const [hash = "", date = "", mail = "", author = "", subject = ""] = r.split(FIELD);
      return { email: mail, subject, author, date, hash };
    })
    .filter((c) => c.email.toLowerCase() === wanted);
}
