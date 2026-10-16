import { writeFileSync, readFileSync, mkdtempSync, renameSync, existsSync, rmSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { appliedMigrations, knownMigrations, resolveDbPath, openRaw, openDb } from "../db";

const stamp = (date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
};

export const backupName = () => `workbench-${stamp()}.db.gz`;

/** A consistent, gzipped copy of the live database (VACUUM INTO is safe with WAL and concurrent readers). */
export async function dumpDatabase(): Promise<Buffer> {
  const source = await resolveDbPath();
  if (!existsSync(source)) throw new Error(`não há banco para salvar em ${source}`);
  const dir = mkdtempSync(join(tmpdir(), "workbench-dump-"));
  const copy = join(dir, "dump.db");
  const raw = await openRaw(source);
  try {
    raw.exec("PRAGMA busy_timeout = 10000");
    raw.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  } finally {
    raw.close();
  }
  try {
    return gzipSync(readFileSync(copy));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Unzips into `dir` and checks the file is a healthy SQLite that this CLI version can open. Returns the db path. */
export async function validateDump(content: Buffer, dir: string): Promise<string> {
  let data: Buffer;
  try {
    data = content[0] === 0x1f && content[1] === 0x8b ? gunzipSync(content) : content;
  } catch {
    throw new Error("o arquivo está corrompido (gzip inválido)");
  }
  if (data.subarray(0, 15).toString("latin1") !== "SQLite format 3") throw new Error("o arquivo não é um banco SQLite");

  const file = join(dir, "restore.db");
  writeFileSync(file, data);
  const raw = await openRaw(file);
  try {
    const [check] = raw.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    if (check?.integrity_check !== "ok") throw new Error("o banco do backup falhou na verificação de integridade");
    if (appliedMigrations(raw) > knownMigrations()) {
      throw new Error("o backup foi feito por uma versão mais nova do workbench; atualize o CLI antes de restaurar");
    }
  } finally {
    raw.close();
  }
  return file;
}

/** Replaces the database with the dump. The swap is a single rename, so a failure never leaves a half-written file. */
export async function restoreDatabase(content: Buffer): Promise<{ target: string }> {
  const target = await resolveDbPath();
  const dir = mkdtempSync(join(dirname(target), ".restore-"));
  try {
    const valid = await validateDump(content, dir);
    renameSync(valid, target);
    for (const suffix of ["-wal", "-shm"]) rmSync(`${target}${suffix}`, { force: true });
    // a dump from an older version still needs the newer migrations
    (await openDb(target)).close();
    return { target };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
