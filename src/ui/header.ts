import { pkg } from "../lib/pkg";

const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;

export function header() {
  console.log(`\n${bold(pkg.displayName ?? pkg.name)} ${dim(`v${pkg.version}`)}\n`);
}
