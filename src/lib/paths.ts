import { isAbsolute, resolve, join } from "node:path";
import { homedir, tmpdir } from "node:os";

const absolute = (value?: string) => (value && isAbsolute(value) ? value : undefined);

export const hasHomeOverride = () => Boolean(process.env.WORKBENCH_HOME);

export function stateDir(): string {
  if (process.env.WORKBENCH_HOME) return resolve(process.env.WORKBENCH_HOME);
  const home = homedir();
  const base =
    process.platform === "win32"
      ? (absolute(process.env.LOCALAPPDATA) ?? join(home, "AppData", "Local"))
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (absolute(process.env.XDG_STATE_HOME) ?? join(home, ".local", "state"));
  return join(base, "workbench");
}

export const fallbackDir = () => join(tmpdir(), "workbench");
