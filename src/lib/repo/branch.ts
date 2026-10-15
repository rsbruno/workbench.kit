export type Node = { parents: string[]; subject: string };

export type Ref = { remote: boolean; name: string; hash: string };

export type Graph = { defaultBranch: string | null; nodes: Map<string, Node>; refs: Ref[] };

export type BranchSource = "title" | "merge" | "ref" | "mainline";

export type Origin = { source: BranchSource | null; branch: string | null };

const BASE = /^(main|master|develop|development|dev|trunk|staging|production|release\/.+)$/;
const PR_MERGE = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/;
const BRANCH_MERGE = /^Merge (?:remote-tracking )?branch '(?:origin\/)?([^']+)'(?: of \S+)?(?: into '?(\S+?)'?)?\s*$/;

export function normalizeRef(name: string): string | null {
  if (name.startsWith("refs/heads/")) return name.slice("refs/heads/".length);
  if (name.startsWith("refs/remotes/")) {
    const rest = name.slice("refs/remotes/".length);
    const name2 = rest.slice(rest.indexOf("/") + 1);
    return name2 === "HEAD" ? null : name2;
  }
  return null;
}

export function mergedBranch(subject: string): string | null {
  const pr = PR_MERGE.exec(subject);
  if (pr) return pr[1]!;
  return BRANCH_MERGE.exec(subject)?.[1] ?? null;
}

export function attribute(graph: Graph, titles: Map<string, string>): Map<string, Origin> {
  const isBase = (name: string) => BASE.test(name) || name === graph.defaultBranch;
  const { nodes } = graph;

  const tips = new Map<string, string[]>();
  for (const ref of graph.refs) {
    const name = normalizeRef(ref.name);
    if (!name) continue;
    tips.set(name, [...new Set([...(tips.get(name) ?? []), ref.hash])]);
  }

  const mainline = new Set<string>();
  for (const [name, hashes] of tips) {
    if (!isBase(name)) continue;
    for (const tip of hashes) {
      let hash: string | undefined = tip;
      while (hash && !mainline.has(hash) && nodes.has(hash)) {
        mainline.add(hash);
        hash = nodes.get(hash)!.parents[0];
      }
    }
  }

  const origin = new Map<string, Origin>();
  const claimed = (hash: string) => origin.has(hash);

  function claim(starts: string[], branch: string, source: BranchSource) {
    const stack = [...starts];
    while (stack.length) {
      const hash = stack.pop()!;
      const node = nodes.get(hash);
      if (!node || mainline.has(hash) || claimed(hash)) continue;
      origin.set(hash, { source, branch });
      stack.push(...node.parents);
    }
  }

  const merges = [...nodes.entries()].filter(([, node]) => node.parents.length > 1);
  const ordered = [...merges.filter(([hash]) => mainline.has(hash)), ...merges.filter(([hash]) => !mainline.has(hash))];
  for (const [, node] of ordered) {
    const branch = mergedBranch(node.subject);
    if (branch && !isBase(branch)) claim(node.parents.slice(1), branch, "merge");
  }

  function reach(start: string): number {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const hash = stack.pop()!;
      const node = nodes.get(hash);
      if (!node || mainline.has(hash) || claimed(hash) || seen.has(hash)) continue;
      seen.add(hash);
      stack.push(...node.parents);
    }
    return seen.size;
  }

  const candidates = [...tips.entries()]
    .filter(([name]) => !isBase(name))
    .map(([name, hashes]) => ({ size: Math.max(...hashes.map(reach)), hashes, name }))
    .sort((a, b) => a.size - b.size || a.name.localeCompare(b.name));
  for (const { hashes, name } of candidates) claim(hashes, name, "ref");

  for (const [hash, title] of titles) origin.set(hash, { source: "title", branch: title });
  for (const hash of mainline) if (!origin.has(hash)) origin.set(hash, { source: "mainline", branch: null });
  return origin;
}
