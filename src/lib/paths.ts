import { isAbsolute, resolve, join } from "node:path";
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
      throw new Error(`WORKBENCH_ENV deve ser "dev" ou "prod" (recebi "${process.env.WORKBENCH_ENV}")`);
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

export function stateDir(env: Env = runtimeEnv()): string {
  if (env === "dev" && runsFromSource()) return packageRoot;
  if (process.env.WORKBENCH_HOME) return resolve(process.env.WORKBENCH_HOME);
  return systemStateDir();
}

export const fallbackDir = () => join(tmpdir(), "workbench");
