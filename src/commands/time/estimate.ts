import type { MonthCommit } from "../../db/commits";
import type { Agent } from "../../lib/config";

import {
  fallbackEstimate,
  validateEstimate,
  type Estimate,
  type Anchors,
  minuteOfDay,
  type Block,
  anchorsOf,
  toBlocks
} from "../../lib/repo/estimate";
import { AgentMissingError, AgentError, askAgent } from "../../lib/agents";
import { WEEKDAYS } from "../timesheet/style";

const CHUNK = 15;
const RETRIES = 2;
const MAX_LINES = 12;
const SUBJECT = 60;
const REASON = 120;
const SUNDAY_FIRST = 6;

export type DayInput = { commits: MonthCommit[]; date: Date; key: string };

export type Source = "agent" | "fallback" | "edited";

export type Proposal = DayInput & {
  /** What was proposed first, to restore after manual edits. */
  original: { blocks: Block[]; reason: string; source: Source };
  anchors: Anchors;
  blocks: Block[];
  reason: string;
  source: Source;
};

type Answer = Estimate & { date: string; reason: string };

export const ESTIMATE_SCHEMA = {
  properties: {
    days: {
      items: {
        properties: {
          startHour: { description: "whole hour the day started (0 to 23)", type: "integer" },
          endHour: { description: "whole hour the day ended (1 to 24)", type: "integer" },
          reason: { description: "one short sentence on why", type: "string" },
          date: { description: "the day, as YYYY-MM-DD", type: "string" }
        },
        required: ["date", "startHour", "endHour", "reason"],
        additionalProperties: false,
        type: "object"
      },
      type: "array"
    }
  },
  additionalProperties: false,
  required: ["days"],
  type: "object"
} as const;

const weekday = (date: Date) => WEEKDAYS[(date.getDay() + SUNDAY_FIRST) % 7]!;
const hhmm = (commit: MonthCommit) => commit.authoredAt.slice(11, 16);

function commitLines(commits: MonthCommit[]): string {
  const lines = commits.map((c) => `${hhmm(c)} ${c.subject.slice(0, SUBJECT)}`);
  if (lines.length <= MAX_LINES) return lines.join("; ");
  const half = MAX_LINES / 2;
  return `${lines.slice(0, half).join("; ")}; (…${lines.length - MAX_LINES} commits no meio…); ${lines.slice(-half).join("; ")}`;
}

export function buildPrompt(days: DayInput[], anchors: Map<string, Anchors>, refused: Map<string, string>): string {
  const lines = days.map(({ commits, date, key }) => {
    const a = anchors.get(key)!;
    const note = refused.has(key) ? `  ← sua resposta anterior foi recusada: ${refused.get(key)}` : "";
    return `- ${key} (${weekday(date)}) · início mínimo ${a.first}h · fim mínimo ${a.last}h · ${commits.length} commits: ${commitLines(commits)}${note}`;
  });
  return [
    "Você estima as horas trabalhadas por dia de um desenvolvedor, olhando como os commits foram feitos ao longo do dia.",
    "",
    "Regras:",
    "1) A jornada padrão é de 8 horas de trabalho, normalmente das 9h às 18h, com almoço das 12h às 13h. Não existe outra pausa: buracos entre commits não descontam nada. O que passar das 18h o sistema trata como hora extra sozinho: você só informa quando o dia começou e terminou.",
    "2) Mantenha o padrão quando os commits couberem nele. Comece mais cedo ou termine mais tarde só quando os commits indicarem (por exemplo, trabalho à noite).",
    "3) Responda sempre em horas inteiras, nunca com minutos. startHour é a hora em que o dia começou e endHour a hora em que terminou.",
    "4) O início mínimo e o fim mínimo de cada dia já estão arredondados (minutos abaixo de 45 vão para a hora de baixo; 45 ou mais, para a de cima). startHour não pode ser maior que o início mínimo e endHour não pode ser menor que o fim mínimo. Só vá além dos commits (começar antes do primeiro ou terminar depois do último) se for necessário para completar as 8h de trabalho; nunca acrescente mais horas do que isso. Sem informação melhor, use exatamente esses valores.",
    "5) Sábados e domingos seguem as mesmas regras.",
    "6) reason é uma frase curta (até 100 caracteres) que justifica a estimativa.",
    "",
    "Responda com exatamente uma entrada para cada data abaixo, no formato pedido.",
    "",
    "Dias:",
    ...lines
  ].join("\n");
}

function parseAnswers(value: unknown): Answer[] {
  const days = (value as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) throw new AgentError("the agent's answer was not in the expected format");
  return days.flatMap((entry): Answer[] => {
    const e = entry as Partial<Answer> | null;
    if (!e || typeof e.date !== "string" || typeof e.startHour !== "number" || typeof e.endHour !== "number") return [];
    return [
      {
        reason: String(e.reason ?? "")
          .trim()
          .slice(0, REASON),
        startHour: e.startHour,
        endHour: e.endHour,
        date: e.date
      }
    ];
  });
}

function proposal(day: DayInput, anchors: Anchors, estimate: Estimate, reason: string, source: Source): Proposal {
  const blocks = toBlocks(estimate);
  return { ...day, original: { blocks, reason, source }, anchors, blocks, reason, source };
}

export type Progress = (done: number, total: number) => void;

/**
 * Asks the agent for the hours of every day, in batches, and checks each answer. A day the agent gets
 * wrong (or leaves out) goes back in a new request, up to RETRIES times; after that it falls back to the
 * plain estimate (start at the first commit, 8 hours of work, until the last commit).
 */
export async function estimateDays(agent: Agent, days: DayInput[], progress?: Progress): Promise<Proposal[]> {
  const anchors = new Map(days.map((d) => [d.key, anchorsOf(d.commits.map((c) => minuteOfDay(c.authoredAt)))]));
  const done = new Map<string, Proposal>();
  let pending = days;
  let refused = new Map<string, string>();

  for (let attempt = 0; attempt <= RETRIES && pending.length; attempt++) {
    const failed = new Map<string, string>();

    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      let answers: Answer[];
      try {
        answers = parseAnswers(await askAgent(agent, buildPrompt(chunk, anchors, refused), ESTIMATE_SCHEMA));
      } catch (error) {
        if (error instanceof AgentMissingError) throw error;
        for (const day of chunk) failed.set(day.key, (error as Error).message);
        continue;
      }

      for (const day of chunk) {
        const answer = answers.find((a) => a.date === day.key);
        const a = anchors.get(day.key)!;
        const problem = answer ? validateEstimate(answer, a) : "the day was left out of the answer";
        if (answer && !problem) done.set(day.key, proposal(day, a, answer, answer.reason || "estimated by the agent", "agent"));
        else failed.set(day.key, problem!);
      }
      progress?.(done.size, days.length);
    }

    pending = pending.filter((d) => !done.has(d.key));
    refused = failed;
  }

  for (const day of pending) {
    const a = anchors.get(day.key)!;
    const why = refused.get(day.key);
    done.set(day.key, proposal(day, a, fallbackEstimate(a), `estimativa de reserva${why ? ` (${why})` : ""}`, "fallback"));
  }
  progress?.(days.length, days.length);
  return days.map((d) => done.get(d.key)!);
}

/** Asks again for a single day (used from the review screen). */
export async function estimateOne(agent: Agent, day: DayInput): Promise<Proposal> {
  const [one] = await estimateDays(agent, [day]);
  return one!;
}
