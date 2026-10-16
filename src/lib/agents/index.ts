import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Agent } from "../config";

import { AgentMissingError, AgentError } from "./exec";
import { type DailyAnswer } from "./schema";
import { runClaude } from "./claude";
import { runCodex } from "./codex";

export { AgentMissingError, AgentError } from "./exec";
export type { DailyAnswer } from "./schema";

const DEFAULT_TIMEOUT_MS = 120_000;
const timeoutMs = () => Number(process.env.WORKBENCH_AGENT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

const HINTS: Record<Agent, string> = {
  codex: "instale o Codex CLI e entre com `codex login`",
  claude: "instale o Claude Code e entre com `claude`"
};

export function parseAnswer(value: unknown): DailyAnswer {
  const answer = value as Partial<DailyAnswer> | null;
  if (!answer || typeof answer.daily !== "string" || typeof answer.hasContent !== "boolean") {
    throw new AgentError("a resposta do agente não veio no formato esperado");
  }
  return { hasContent: answer.hasContent, daily: answer.daily };
}

/** Asks the agent for one structured answer. It runs in an empty temp folder, so it never sees a repository. */
export async function askAgent(agent: Agent, prompt: string): Promise<DailyAnswer> {
  const dir = await mkdtemp(join(tmpdir(), "workbench-agent-"));
  const options = { timeoutMs: timeoutMs(), input: prompt, cwd: dir };
  try {
    return parseAnswer(agent === "claude" ? await runClaude(options) : await runCodex(options));
  } catch (error) {
    if (error instanceof AgentMissingError)
      throw new AgentMissingError(`${error.message}: ${HINTS[agent]}, ou escolha outro agente com workbench config agent`);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
