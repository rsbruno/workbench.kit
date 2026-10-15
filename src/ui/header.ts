import { join } from "node:path";

import { runtimeEnv, stateDir, dbFile } from "../lib/paths";
import { pkg } from "../lib/pkg";

const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;

function devTag(): string {
  try {
    return runtimeEnv() === "dev" ? ` ${yellow("[dev]")} ${dim(join(stateDir(), dbFile()))}` : "";
  } catch {
    return "";
  }
}

export function header() {
  process.stdout.write(`\n${bold(pkg.displayName ?? pkg.name)} ${dim(`v${pkg.version}`)}${devTag()}\n\n`);
}
