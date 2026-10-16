import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JsonSchema } from "./schema";
import type { Agent } from "../config";

import { AgentMissingError } from "./exec";
import { runClaude } from "./claude";
import { runCodex } from "./codex";

export { DAILY_SCHEMA, type DailyAnswer, type JsonSchema } from "./schema";
export { AgentMissingError, AgentError } from "./exec";

const DEFAULT_TIMEOUT_MS = 120_000;
const timeoutMs = () => Number(process.env.WORKBENCH_AGENT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

const HINTS: Record<Agent, string> = {
  codex: "install the Codex CLI and sign in with `codex login`",
  claude: "install Claude Code and sign in with `claude`"
};

/**
 * Asks the agent for one structured answer shaped by `schema` and returns the raw JSON; the caller
 * validates it. It runs in an empty temp folder, so the agent never sees a repository.
 */
export async function askAgent(agent: Agent, prompt: string, schema: JsonSchema): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "workbench-agent-"));
  const options = { timeoutMs: timeoutMs(), input: prompt, cwd: dir };
  try {
    return agent === "claude" ? await runClaude(options, schema) : await runCodex(options, schema);
  } catch (error) {
    if (error instanceof AgentMissingError)
      throw new AgentMissingError(`${error.message}: ${HINTS[agent]}, or choose another agent with workbench config agent`);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
