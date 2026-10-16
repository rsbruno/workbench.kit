import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { readFileSync, constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { hasHomeOverride, fallbackDir, stateDir, dbFile } from "../lib/paths";
import { packageRoot } from "../lib/pkg";
import * as schema from "./schema";

type Stmt = {
  setReturnArrays?: (on: boolean) => void;
  values?: (...params: unknown[]) => unknown[][];
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => unknown;
};
type Raw = { prepare: (sql: string) => Stmt; exec: (sql: string) => void; close: () => void };
type Driver = { DatabaseSync?: new (file: string) => Raw; Database?: new (file: string) => Raw };

export type Db = ReturnType<typeof drizzle<typeof schema>>;

async function writableDir(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDbPath(): Promise<string> {
  const main = stateDir();
  if (await writableDir(main)) return join(main, dbFile());
  if (hasHomeOverride()) throw new Error(`WORKBENCH_HOME is not writable: ${main}`);

  const fallback = fallbackDir();
  if (!(await writableDir(fallback)))
    throw new Error(`no writable directory for the database; set WORKBENCH_HOME (tried ${main})`);
  process.stderr.write(`warning: ${main} is not writable; using ${fallback} (data may be lost on reboot)\n`);
  return join(fallback, dbFile());
}

function silenceSqliteWarning() {
  const proc = process as unknown as { emit: (name: string, ...args: unknown[]) => boolean };
  const emit = proc.emit.bind(proc);
  proc.emit = (name, ...args) =>
    name === "warning" && /SQLite/.test(String((args[0] as Error)?.message)) ? false : emit(name, ...args);
}

export async function openRaw(file: string): Promise<Raw> {
  const bun = Boolean(process.versions.bun);
  if (!bun) silenceSqliteWarning();
  const mod = (await import(bun ? "bun:sqlite" : "node:sqlite")) as Driver;
  const Ctor = (bun ? mod.Database : mod.DatabaseSync)!;
  return new Ctor(file);
}

function rowsOf(stmt: Stmt, params: unknown[]): unknown[][] {
  if (stmt.values) return stmt.values(...params);
  stmt.setReturnArrays?.(true);
  return stmt.all(...params) as unknown[][];
}

const migrationsFolder = () => join(packageRoot, "drizzle");

export function knownMigrations(): number {
  const journal = JSON.parse(readFileSync(join(migrationsFolder(), "meta", "_journal.json"), "utf8")) as {
    entries: unknown[];
  };
  return journal.entries.length;
}

export function appliedMigrations(raw: Raw): number {
  const created = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").all();
  if (!created.length) return 0;
  const [row] = raw.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").all() as { n: number }[];
  return Number(row?.n ?? 0);
}

async function migrateExclusively(raw: Raw, db: Db) {
  raw.exec("BEGIN IMMEDIATE");
  try {
    if (appliedMigrations(raw) > knownMigrations()) {
      throw new Error("o banco foi atualizado por uma versão mais nova do workbench; atualize o CLI antes de continuar");
    }
    await migrate(
      db,
      async (queries) => {
        for (const query of queries) raw.exec(query);
      },
      { migrationsFolder: migrationsFolder() }
    );
    raw.exec("COMMIT");
  } catch (e) {
    raw.exec("ROLLBACK");
    throw e;
  }
}

export async function withDb<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const { close, db } = await openDb();
  try {
    return await run(db);
  } finally {
    close();
  }
}

export async function openDb(file?: string): Promise<{ close: () => void; db: Db }> {
  file ??= await resolveDbPath();
  await mkdir(dirname(file), { recursive: true });
  const raw = await openRaw(file);
  raw.exec("PRAGMA busy_timeout = 10000");
  raw.exec("PRAGMA foreign_keys = ON");

  const db = drizzle<typeof schema>(
    async (sql, params, method) => {
      const stmt = raw.prepare(sql);
      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }
      const rows = rowsOf(stmt, params);
      return { rows: method === "get" ? (rows[0] as unknown[]) : rows };
    },
    { schema }
  );

  await migrateExclusively(raw, db);
  return { close: () => raw.close(), db };
}
