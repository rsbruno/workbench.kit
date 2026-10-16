import type { Command } from "../../lib/command";

import { defineCommand } from "../../lib/command";
import { selectOne } from "../../ui/prompt";
import { agent } from "./agent";
import { show } from "./show";

const options: { command: Command; detail: string; name: string }[] = [
  { detail: "claude ou codex", name: "Agente de IA", command: agent },
  { detail: "valores atuais e o arquivo", name: "Ver configuração", command: show }
];

export const menu = defineCommand({
  run: async (_args, flags) => {
    const picked = await selectOne(
      "O que configurar?",
      options.map(({ detail, name }, value) => ({ detail, value, name }))
    );
    await options[picked]!.command.run([], flags);
  },
  description: "open the settings menu (what `workbench config` does with no action)",
  name: "menu"
});
