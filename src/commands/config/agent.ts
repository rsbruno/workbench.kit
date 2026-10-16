import { writeConfig, type Agent, readConfig, isAgent, AGENTS } from "../../lib/config";
import { defineCommand } from "../../lib/command";
import { selectOne } from "../../ui/prompt";
import { info } from "../../ui/summary";

export const agent = defineCommand({
  run: async (args) => {
    const [given] = args;
    if (given && !isAgent(given)) throw new Error(`unknown agent: "${given}" (use ${AGENTS.join(" or ")})`);

    const current = readConfig().agent;
    const chosen =
      given ??
      (await selectOne<Agent>(
        "Which agent writes the dailies?",
        AGENTS.map((name) => ({ detail: name === current ? "current" : undefined, value: name, name }))
      ));
    writeConfig({ agent: chosen as Agent });
    info(`default agent: ${chosen}`);
  },
  description: "choose the AI agent that writes the dailies: agent [claude|codex] (asks when omitted)",
  name: "agent"
});
