import { isAbsolute, basename, resolve, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import { originUrl, repoRoot } from "./git";

export type RepoFields = { folderName: string; remote: string; path: string };

export function expandPath(input: string): string {
  const value = input.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(join(homedir(), value.slice(2)));
  return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
}

export function pathError(input: string): string | undefined {
  if (!input.trim()) return "the project folder is required";
  const path = expandPath(input);
  if (!existsSync(path)) return `the folder does not exist: ${path}`;
  if (!statSync(path).isDirectory()) return `not a folder: ${path}`;
  if (!existsSync(join(path, ".git"))) return `no .git in ${path}`;
  return undefined;
}

export function folderError(input: string): string | undefined {
  const value = input.trim();
  if (!value) return "the folder name is required";
  if (/[\\/]/.test(value)) return "the folder name cannot contain / or \\";
  return undefined;
}

export const remoteError = (input: string) => (input.trim() ? undefined : "the remote is required");

export async function defaultPath(cwd = process.cwd()): Promise<string> {
  const root = await repoRoot(cwd);
  return root ? resolve(root) : resolve(cwd);
}

export const defaultFolder = (path: string) => basename(path);

export const defaultRemote = (path: string) => originUrl(path);

export function assertFields(fields: RepoFields) {
  const error = pathError(fields.path) ?? folderError(fields.folderName) ?? remoteError(fields.remote);
  if (error) throw new Error(error);
}
