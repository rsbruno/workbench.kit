import { writeFileSync, readFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { configFile } from "./paths";

export const AGENTS = ["claude", "codex"] as const;

export type Agent = (typeof AGENTS)[number];

export type Config = { agent?: Agent };

export const isAgent = (value: unknown): value is Agent => AGENTS.includes(value as Agent);

function invalid(file: string, reason: string): never {
  throw new Error(`configuração inválida em ${file}: ${reason}`);
}

export function readConfig(): Config {
  const file = configFile();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return invalid(file, "o arquivo não é um JSON válido (corrija ou apague o arquivo)");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid(file, "esperava um objeto JSON");

  const { agent } = data as Record<string, unknown>;
  if (agent !== undefined && !isAgent(agent))
    return invalid(file, `agente "${String(agent)}" desconhecido (use ${AGENTS.join(" ou ")})`);
  return agent === undefined ? {} : { agent };
}

/** Merges the patch into the saved config. Reads first, so an invalid file is never overwritten. */
export function writeConfig(patch: Config): Config {
  const next: Config = { ...readConfig(), ...patch };
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, file);
  return next;
}
