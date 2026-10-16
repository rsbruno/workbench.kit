import { isAbsolute, resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { packageRoot } from "./pkg";

export type Env = "dev" | "prod";

const absolute = (value?: string) => (value && isAbsolute(value) ? value : undefined);

const runsFromSource = () => fileURLToPath(import.meta.url).endsWith(".ts");

export const hasHomeOverride = () => Boolean(process.env.WORKBENCH_HOME);

export function runtimeEnv(): Env {
  const forced = process.env.WORKBENCH_ENV?.trim().toLowerCase();
  if (forced) {
    if (forced !== "dev" && forced !== "prod") {
      throw new Error(`WORKBENCH_ENV must be "dev" or "prod" (got "${process.env.WORKBENCH_ENV}")`);
    }
    return forced;
  }
  return runsFromSource() ? "dev" : "prod";
}

export const dbFile = (env: Env = runtimeEnv()) => (env === "dev" ? "workbench.dev.db" : "workbench.db");

function systemStateDir(): string {
  const home = homedir();
  const base =
    process.platform === "win32"
      ? (absolute(process.env.LOCALAPPDATA) ?? join(home, "AppData", "Local"))
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (absolute(process.env.XDG_STATE_HOME) ?? join(home, ".local", "state"));
  return join(base, "workbench");
}

function systemConfigDir(): string {
  const home = homedir();
  const base =
    process.platform === "win32"
      ? (absolute(process.env.APPDATA) ?? join(home, "AppData", "Roaming"))
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (absolute(process.env.XDG_CONFIG_HOME) ?? join(home, ".config"));
  return join(base, "workbench");
}

/** Where the user settings live: the system config folder, never the database. */
export function configDir(env: Env = runtimeEnv()): string {
  if (env === "dev" && runsFromSource()) return systemConfigDir();
  if (process.env.WORKBENCH_HOME) return resolve(process.env.WORKBENCH_HOME);
  return systemConfigDir();
}

export const configFile = (env: Env = runtimeEnv()) => join(configDir(env), env === "dev" ? "config.dev.json" : "config.json");

export function stateDir(env: Env = runtimeEnv()): string {
  if (env === "dev" && runsFromSource()) return packageRoot;
  if (process.env.WORKBENCH_HOME) return resolve(process.env.WORKBENCH_HOME);
  return systemStateDir();
}

export const fallbackDir = () => join(tmpdir(), "workbench");

const APP_FOLDER = "workbench";

export function parseUserDirs(content: string, home: string): string | undefined {
  const match = /^\s*XDG_DOCUMENTS_DIR\s*=\s*"([^"]+)"/m.exec(content);
  if (!match) return undefined;
  const dir = match[1]!.replace(/^\$HOME(?=\/|$)/, home);
  return isAbsolute(dir) && resolve(dir) !== resolve(home) ? resolve(dir) : undefined;
}

function windowsDocuments(): string | undefined {
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('MyDocuments')"],
      { windowsHide: true, encoding: "utf8", timeout: 5000 }
    ).trim();
    return absolute(out);
  } catch {
    return undefined;
  }
}

function linuxDocuments(home: string): string | undefined {
  const fromEnv = absolute(process.env.XDG_DOCUMENTS_DIR);
  if (fromEnv) return fromEnv;
  const config = absolute(process.env.XDG_CONFIG_HOME) ?? join(home, ".config");
  try {
    return parseUserDirs(readFileSync(join(config, "user-dirs.dirs"), "utf8"), home);
  } catch {
    return undefined;
  }
}

/** The user's real Documents folder, whatever the system language (Documentos, Documents, Dokumente...). */
export function documentsDir(): string {
  const home = homedir();
  const found =
    process.platform === "win32"
      ? windowsDocuments()
      : process.platform === "darwin"
        ? join(home, "Documents")
        : linuxDocuments(home);
  if (found && existsSync(found)) return found;
  return ["Documents", "Documentos"].map((name) => join(home, name)).find(existsSync) ?? home;
}

const appDir = () => join(documentsDir(), APP_FOLDER);

export const timesheetsDir = () => join(appDir(), "timesheets");

export const backupsDir = () => join(appDir(), "backups");
