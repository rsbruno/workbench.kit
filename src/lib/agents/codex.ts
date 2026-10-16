import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { JsonSchema } from "./schema";

import { type ExecOptions, AgentError, exec } from "./exec";

export async function runCodex(options: ExecOptions, schema: JsonSchema): Promise<unknown> {
  const dir = join(options.cwd, "codex");
  await mkdir(dir, { recursive: true });
  const schemaFile = join(dir, "schema.json");
  const output = join(dir, "answer.json");
  await writeFile(schemaFile, JSON.stringify(schema));

  const args = [
    ...["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never"],
    ...["--output-schema", schemaFile, "-o", output, "-"]
  ];
  const { stderr, code } = await exec("codex", args, options);
  if (code !== 0) {
    const detail = stderr.trim().split("\n").at(-1) ?? "";
    throw new AgentError(`o Codex terminou com erro (código ${code})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  try {
    return JSON.parse(await readFile(output, "utf8"));
  } catch {
    throw new AgentError("o Codex não devolveu um JSON válido");
  }
}
