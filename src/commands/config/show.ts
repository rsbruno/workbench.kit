import { defineCommand } from "../../lib/command";
import { readConfig } from "../../lib/config";
import { configFile } from "../../lib/paths";
import { summary } from "../../ui/summary";

export const show = defineCommand({
  run: async (_args, flags) => {
    const config = readConfig();
    if (flags.json) return void process.stdout.write(`${JSON.stringify({ file: configFile(), ...config }, null, 2)}\n`);
    summary("configuração", [
      { detail: config.agent ?? "(não definido)", name: "agente" },
      { detail: configFile(), name: "arquivo" }
    ]);
  },
  description: "print the current settings and where they are saved (--json for raw output)",
  name: "show"
});
