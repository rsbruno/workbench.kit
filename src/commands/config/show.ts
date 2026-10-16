import { defineCommand } from "../../lib/command";
import { readConfig } from "../../lib/config";
import { configFile } from "../../lib/paths";
import { summary } from "../../ui/summary";

export const show = defineCommand({
  run: async (_args, flags) => {
    const config = readConfig();
    if (flags.json)
      return void process.stdout.write(
        `${JSON.stringify({ file: configFile(), ...config, drive: config.drive ? { email: config.drive.email, connected: true } : undefined }, null, 2)}\n`
      );
    summary("settings", [
      { detail: config.agent ?? "(not set)", name: "agent" },
      {
        detail: config.drive ? `connected${config.drive.email ? ` (${config.drive.email})` : ""}` : "(not connected)",
        name: "drive"
      },
      { detail: configFile(), name: "file" }
    ]);
  },
  description: "print the current settings and where they are saved (--json for raw output)",
  name: "show"
});
