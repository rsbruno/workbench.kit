import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Pkg = {
  displayName?: string;
  version: string;
  name: string;
};

function findPackageJson(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("package.json not found");
    dir = parent;
  }
  return join(dir, "package.json");
}

export const pkg: Pkg = JSON.parse(readFileSync(findPackageJson(), "utf8"));
