import type { MonthCommit } from "../../db/commits";
import type { Agent } from "../../lib/config";

import { AgentMissingError, type DailyAnswer, DAILY_SCHEMA, AgentError, askAgent } from "../../lib/agents";

export const MIN_CHARS = 200;
export const MAX_CHARS = 300;

const RETRIES = 2;
const MAX_COMMITS = 40;
const MAX_BODY = 240;
const MAX_PROMPT = 6000;

function parseDailyAnswer(value: unknown): DailyAnswer {
  const answer = value as Partial<DailyAnswer> | null;
  if (!answer || typeof answer.daily !== "string" || typeof answer.hasContent !== "boolean") {
    throw new AgentError("the agent's answer was not in the expected format");
  }
  return { hasContent: answer.hasContent, daily: answer.daily };
}

export const countChars = (text: string) => [...text.trim()].length;

export function lengthError(text: string): string | undefined {
  const size = countChars(text);
  return size >= MIN_CHARS && size <= MAX_CHARS ? undefined : `has ${size} characters; use ${MIN_CHARS} to ${MAX_CHARS}`;
}

function commitLine(commit: MonthCommit): string {
  const kind = commit.type ? `[${commit.type}] ` : "";
  const body = commit.body.replace(/\s+/g, " ").trim().slice(0, MAX_BODY);
  return `- ${kind}${commit.subject}${body ? ` (${body})` : ""}`;
}

export function buildPrompt(project: string, commits: MonthCommit[]): string {
  const lines: string[] = [];
  let size = 0;
  for (const commit of commits.slice(0, MAX_COMMITS)) {
    const line = commitLine(commit);
    if (size + line.length > MAX_PROMPT) break;
    lines.push(line);
    size += line.length;
  }
  if (lines.length < commits.length) lines.push(`- (e mais ${commits.length - lines.length} commits do mesmo dia)`);

  return [
    `Você escreve a daily de um desenvolvedor sobre o projeto "${project}".`,
    "A partir dos commits abaixo, todos do mesmo dia, escreva o relato do dia:",
    "1) em primeira pessoa e em português do Brasil, explicando o que foi feito;",
    `2) de ${MIN_CHARS} a ${MAX_CHARS} caracteres, contando os espaços, em um único parágrafo;`,
    '3) sem datas, sem "ontem" nem "hoje", sem hashes de commit, sem emojis e sem listas;',
    "4) se os commits não permitirem relatar nada útil, responda hasContent como false.",
    "Responda no formato pedido: daily (o texto) e hasContent.",
    "",
    "Commits:",
    ...lines
  ].join("\n");
}

export type Draft = { initial?: string; text?: string; note?: string };

/**
 * Asks the agent for the day's daily and keeps it only when it respects the size. A wrong size is
 * sent back to the agent up to RETRIES times; after that the best text goes back as a starting
 * point so the user can fix it by hand.
 */
export async function draftDaily(agent: Agent, project: string, commits: MonthCommit[]): Promise<Draft> {
  const base = buildPrompt(project, commits);
  let prompt = base;
  let last = "";

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let answer;
    try {
      answer = parseDailyAnswer(await askAgent(agent, prompt, DAILY_SCHEMA));
    } catch (error) {
      if (error instanceof AgentMissingError) throw error;
      return { note: (error as Error).message, initial: last || undefined };
    }
    if (!answer.hasContent) return { note: "the commits of the day do not allow reporting what was done" };

    last = answer.daily.trim();
    if (!lengthError(last)) return { text: last };
    prompt = `${base}\n\nSeu texto anterior tinha ${countChars(last)} caracteres. Reescreva mantendo o sentido, com ${MIN_CHARS} a ${MAX_CHARS} caracteres.`;
  }
  return { note: `the agent missed the length (${countChars(last)} characters)`, initial: last };
}
