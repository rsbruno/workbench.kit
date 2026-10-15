import type { Project } from "../../db/schema";

import { defaultFolder, defaultRemote, defaultPath, folderError, remoteError, pathError } from "../../lib/repo/fields";
import { type ProjectPatch, assertNameFree, updateProject } from "../../db/projects";
import { pickProject, projectRows, required } from "./shared";
import { defineCommand, type Flags } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { askText } from "../../ui/prompt";
import { withDb } from "../../db";

async function askAll(db: Parameters<typeof assertNameFree>[0], project: Project): Promise<ProjectPatch> {
  const name = await askText("Nome do projeto", {
    initial: project.name,
    validate: required
  });
  await assertNameFree(db, name, project.id);
  const path = await askText("Pasta do projeto", {
    initial: project.path || (await defaultPath()),
    validate: pathError
  });
  const folderName = await askText("Nome da pasta", {
    initial: project.folderName || defaultFolder(path),
    validate: folderError
  });
  const remote = await askText("Remote", {
    initial: project.remote || ((await defaultRemote(path)) ?? ""),
    validate: remoteError
  });
  return { folderName, remote, path, name };
}

function givenPatch(nameArg: string, flags: Flags): ProjectPatch {
  const patch: ProjectPatch = {};
  if (nameArg) patch.name = nameArg;
  if (flags.path?.trim()) patch.path = flags.path;
  if (flags.folder?.trim()) patch.folderName = flags.folder;
  if (flags.remote?.trim()) patch.remote = flags.remote;
  return patch;
}

export const update = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const [ref, ...rest] = args;
      const project = await pickProject(db, ref, "Qual projeto editar?");
      const given = givenPatch(rest.join(" ").trim(), flags);
      const patch = Object.keys(given).length ? given : await askAll(db, project);
      if (patch.name) await assertNameFree(db, patch.name, project.id);

      const result = await updateProject(db, project, patch);
      if (!result.changed) return info("nada mudou");
      summary("projeto atualizado", projectRows(result.project));
    }),
  description: "edit a project: update [name|id] [new name] [--path] [--folder] [--remote] (asks all when none)",
  aliases: ["edit"],
  name: "update"
});
