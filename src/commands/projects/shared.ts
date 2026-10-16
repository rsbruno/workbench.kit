import type { Project } from "../../db/schema";
import type { Flags } from "../../lib/command";
import type { Db } from "../../db";

import {
  type RepoFields,
  defaultFolder,
  defaultRemote,
  defaultPath,
  folderError,
  remoteError,
  expandPath,
  pathError
} from "../../lib/repo/fields";
import { listProjects, findProject } from "../../db/projects";
import { selectOne, askText } from "../../ui/prompt";

export const required = (v: string) => (v ? undefined : "the project name is required");

export const projectRows = (p: Project) => [
  { detail: p.name, name: "nome" },
  { detail: p.id, name: "id" },
  { detail: p.path || "(empty)", name: "folder" },
  { detail: p.folderName || "(empty)", name: "folder name" },
  { detail: p.remote || "(empty)", name: "remote" },
  { detail: p.createdAt, name: "criado em" },
  { name: "atualizado em", detail: p.updatedAt }
];

type Question = {
  validate: (value: string) => string | undefined;
  fallback: string | null;
  flag?: string;
  label: string;
  tty: boolean;
};

async function answer({ validate, fallback, label, flag, tty }: Question): Promise<string> {
  if (flag?.trim()) return flag.trim();
  if (!tty) return fallback ?? "";
  const value = await askText(label, {
    validate: (v) => validate(v || fallback || ""),
    placeholder: fallback ?? undefined
  });
  return value || fallback || "";
}

export async function resolveFields(flags: Flags): Promise<RepoFields> {
  const tty = Boolean(process.stdin.isTTY);

  const path = expandPath(
    await answer({
      fallback: await defaultPath(),
      label: "Project folder",
      validate: pathError,
      flag: flags.path,
      tty
    })
  );
  const folderName = await answer({
    fallback: defaultFolder(path),
    validate: folderError,
    label: "Folder name",
    flag: flags.folder,
    tty
  });
  const remote = await answer({
    fallback: await defaultRemote(path),
    validate: remoteError,
    flag: flags.remote,
    label: "Remote",
    tty
  });
  return { folderName, remote, path };
}

export async function pickProject(db: Db, ref: string | undefined, message: string): Promise<Project> {
  if (ref) return findProject(db, ref);
  const all = await listProjects(db);
  if (!all.length) throw new Error("no projects registered");
  const id = await selectOne(
    message,
    all.map((p) => ({ detail: p.path || "incompleto", name: p.name, value: p.id }))
  );
  return all.find((p) => p.id === id)!;
}
