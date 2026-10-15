import { basename, resolve } from "node:path";
import { realpathSync } from "node:fs";

import type { Project } from "../../db/schema";

const canonical = (path: string) => {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
};

const same = (a: string, b: string) => (process.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase());

export function matchProjects(projects: Project[], root: string): Project[] {
  const target = canonical(root);
  const byPath = projects.filter((p) => p.path && same(canonical(p.path), target));
  if (byPath.length) return byPath;

  const folder = basename(target);
  return projects.filter((p) => p.folderName && same(p.folderName, folder));
}
