import type { Command } from "../../lib/command";

import { defineCommand } from "../../lib/command";
import { selectOne } from "../../ui/prompt";
import { agent } from "./agent";
import { drive } from "./drive";
import { show } from "./show";

const options: { command: Command; detail: string; name: string }[] = [
  { detail: "claude or codex", name: "AI agent", command: agent },
  { detail: "account that stores the backups", name: "Google Drive", command: drive },
  { detail: "current values and the file", name: "Show settings", command: show }
];

export const menu = defineCommand({
  run: async (_args, flags) => {
    const picked = await selectOne(
      "What do you want to configure?",
      options.map(({ detail, name }, value) => ({ detail, value, name }))
    );
    await options[picked]!.command.run([], flags);
  },
  description: "open the settings menu (what `workbench config` does with no action)",
  name: "menu"
});
