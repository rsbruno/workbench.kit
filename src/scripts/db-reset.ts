import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { stateDir, dbFile } from "../lib/paths";

const file = join(stateDir("dev"), dbFile("dev"));
const found = existsSync(file);

for (const path of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
  await rm(path, { force: true });
}

process.stdout.write(found ? `dev database removed: ${file}\n` : `no dev database at ${file}\n`);
