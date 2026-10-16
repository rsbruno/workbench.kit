import { writeConfig, type Agent, readConfig, isAgent, AGENTS } from "../../lib/config";
import { defineCommand } from "../../lib/command";
import { selectOne } from "../../ui/prompt";
import { info } from "../../ui/summary";

export const agent = defineCommand({
  run: async (args) => {
    const [given] = args;
    if (given && !isAgent(given)) throw new Error(`agente desconhecido: "${given}" (use ${AGENTS.join(" ou ")})`);

    const current = readConfig().agent;
    const chosen =
      given ??
      (await selectOne<Agent>(
        "Qual agente escreve as dailies?",
        AGENTS.map((name) => ({ detail: name === current ? "atual" : undefined, value: name, name }))
      ));
    writeConfig({ agent: chosen as Agent });
    info(`agente padrão: ${chosen}`);
  },
  description: "choose the AI agent that writes the dailies: agent [claude|codex] (asks when omitted)",
  name: "agent"
});
