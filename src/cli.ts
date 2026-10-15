#!/usr/bin/env node
import { intro, outro } from "@clack/prompts";
import { parseArgs } from "node:util";

import { findCommand } from "./lib/command";
import { header } from "./ui/header";
import { groups } from "./commands";
import { pkg } from "./lib/pkg";

const FLAGS_HELP = "flags: --since/--until DD/MM/AAAA (timesheet explore)   --json   -v, --version";

function help() {
  header();
  const lines = Object.entries(groups).flatMap(([group, commands]) => [
    `workbench ${group} <command>`,
    "",
    ...commands.map((c) => `  ${c.name.padEnd(8)} ${c.description}`),
    ""
  ]);
  process.stdout.write(`${[...lines, FLAGS_HELP, ""].join("\n")}\n`);
}

function parse() {
  try {
    return parseArgs({
      options: {
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
        since: { type: "string" },
        until: { type: "string" },
        json: { type: "boolean" }
      },
      allowPositionals: true
    });
  } catch (e) {
    console.error(`error: ${(e as Error).message.split(". ")[0]}`);
    process.exit(1);
  }
}

const { positionals, values } = parse();

if (values.version) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const [group, action, ...rest] = positionals;
const command = group && action ? findCommand(groups[group] ?? [], action) : undefined;

if (values.help || !command) {
  help();
  process.exit(values.help ? 0 : 1);
}

try {
  header();
  intro(`workbench ${group} ${command.name}`);
  await command.run(rest, values);
  outro("done");
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
