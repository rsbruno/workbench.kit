import { type ExecOptions, AgentError, exec } from "./exec";
import { DAILY_SCHEMA } from "./schema";

type Envelope = { structured_output?: unknown; is_error?: boolean; subtype?: string; result?: string };

export async function runClaude(options: ExecOptions): Promise<unknown> {
  const args = [
    ...["-p", "--tools", "", "--no-session-persistence"],
    ...["--output-format", "json", "--json-schema", JSON.stringify(DAILY_SCHEMA)]
  ];
  const { stderr, stdout, code } = await exec("claude", args, options);

  let envelope: Envelope;
  try {
    envelope = JSON.parse(stdout) as Envelope;
  } catch {
    const detail = (stderr || stdout).trim().split("\n").at(-1) ?? "";
    throw new AgentError(
      `o Claude não devolveu JSON${code ? ` (código ${code})` : ""}${detail ? `: ${detail.slice(0, 160)}` : ""}`
    );
  }
  if (envelope.is_error || (envelope.subtype && envelope.subtype !== "success")) {
    throw new AgentError(
      `o Claude respondeu com erro: ${String(envelope.result ?? envelope.subtype ?? "desconhecido").slice(0, 160)}`
    );
  }
  if (envelope.structured_output === undefined) throw new AgentError("o Claude não devolveu a resposta estruturada");
  return envelope.structured_output;
}
