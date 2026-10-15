import type { Commit } from "./git";

export type Day = { commits: Commit[]; day: string };

export function groupByDay(commits: Commit[]): Day[] {
  const days = new Map<string, Commit[]>();
  for (const c of commits) {
    const day = c.date.slice(0, 10);
    const list = days.get(day);
    if (list) list.push(c);
    else days.set(day, [c]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ commits: list.sort((a, b) => a.date.localeCompare(b.date)), day }));
}
