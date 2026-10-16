import type { JsonSchema } from "./schema";

import { type ExecOptions, AgentError, exec } from "./exec";

type Envelope = { structured_output?: unknown; is_error?: boolean; subtype?: string; result?: string };

export async function runClaude(options: ExecOptions, schema: JsonSchema): Promise<unknown> {
  const args = [
    ...["-p", "--tools", "", "--no-session-persistence"],
    ...["--output-format", "json", "--json-schema", JSON.stringify(schema)]
  ];
  const { stderr, stdout, code } = await exec("claude", args, options);

  let envelope: Envelope;
  try {
    envelope = JSON.parse(stdout) as Envelope;
  } catch {
    const detail = (stderr || stdout).trim().split("\n").at(-1) ?? "";
    throw new AgentError(
      `Claude did not return JSON${code ? ` (code ${code})` : ""}${detail ? `: ${detail.slice(0, 160)}` : ""}`
    );
  }
  if (envelope.is_error || (envelope.subtype && envelope.subtype !== "success")) {
    throw new AgentError(
      `Claude replied with an error: ${String(envelope.result ?? envelope.subtype ?? "unknown").slice(0, 160)}`
    );
  }
  if (envelope.structured_output === undefined) throw new AgentError("Claude did not return the structured answer");
  return envelope.structured_output;
}
