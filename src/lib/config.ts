import { writeFileSync, readFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { configFile } from "./paths";

export const AGENTS = ["claude", "codex"] as const;

export type Agent = (typeof AGENTS)[number];

export type DriveConfig = { refreshToken: string; clientSecret: string; clientId: string; email?: string };

export type Config = { drive?: DriveConfig; lastBackup?: string; agent?: Agent };

export const isAgent = (value: unknown): value is Agent => AGENTS.includes(value as Agent);

function isDrive(value: unknown): value is DriveConfig {
  if (!value || typeof value !== "object") return false;
  const { refreshToken, clientSecret, clientId, email } = value as Record<string, unknown>;
  return (
    [refreshToken, clientSecret, clientId].every((v) => typeof v === "string" && v.length > 0) &&
    (email === undefined || typeof email === "string")
  );
}

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

  const { lastBackup, agent, drive } = data as Record<string, unknown>;
  if (agent !== undefined && !isAgent(agent))
    return invalid(file, `agente "${String(agent)}" desconhecido (use ${AGENTS.join(" ou ")})`);
  if (drive !== undefined && !isDrive(drive)) return invalid(file, "a seção drive está incompleta (rode workbench config drive)");
  if (lastBackup !== undefined && (typeof lastBackup !== "string" || Number.isNaN(Date.parse(lastBackup))))
    return invalid(file, "lastBackup não é uma data válida");
  return {
    ...(agent === undefined ? {} : { agent }),
    ...(drive === undefined ? {} : { drive }),
    ...(lastBackup === undefined ? {} : { lastBackup })
  };
}

/** Merges the patch into the saved config. Reads first, so an invalid file is never overwritten. */
export function writeConfig(patch: Config): Config {
  const next: Config = { ...readConfig(), ...patch };
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  // the file holds the Drive refresh token, so only the owner may read it
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  return next;
}

/** The agent only comes from the settings; commands that need it stop with the way to set it. */
export function requireAgent(): Agent {
  const agent = readConfig().agent;
  if (!agent) {
    throw new Error(
      "nenhum agente de IA configurado. Defina com: workbench config agent claude (ou codex), ou rode workbench config para escolher"
    );
  }
  return agent;
}

/** Backup commands need a connected Drive account; stop with the way to connect. */
export function requireDrive(): DriveConfig {
  const drive = readConfig().drive;
  if (!drive) throw new Error("o Google Drive não está conectado. Conecte com: workbench config drive");
  return drive;
}
