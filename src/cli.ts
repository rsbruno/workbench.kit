#!/usr/bin/env node
import { intro, outro } from "@clack/prompts";
import { parseArgs } from "node:util";

import { findCommand } from "./lib/command";
import { header } from "./ui/header";
import { groups } from "./commands";
import { pkg } from "./lib/pkg";

const FLAGS_HELP =
  "flags: --since/--until DD/MM/AAAA, --project <name|id> (commits explore, daily, timesheet)   --json   --force   --path/--folder/--remote (projects add|update)   --text (daily add|update, time)   --start/--end HH:MM --type comum|extra (time)   -v, --version";

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
        force: { type: "boolean", short: "f" },
        help: { type: "boolean", short: "h" },
        project: { type: "string" },
        folder: { type: "string" },
        remote: { type: "string" },
        start: { type: "string" },
        since: { type: "string" },
        until: { type: "string" },
        json: { type: "boolean" },
        type: { type: "string" },
        text: { type: "string" },
        path: { type: "string" },
        end: { type: "string" }
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

const quiet = Boolean(values.json);

try {
  if (!quiet) {
    header();
    intro(`workbench ${group} ${command.name}`);
  }
  await command.run(rest, values);
  if (!quiet) outro("done");
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
