import { assertNameFree, createProject } from "../../db/projects";
import { resolveFields, projectRows, required } from "./shared";
import { defineCommand } from "../../lib/command";
import { summary } from "../../ui/summary";
import { askText } from "../../ui/prompt";
import { withDb } from "../../db";

export const add = defineCommand({
  run: async (args, flags) => {
    const name = args.join(" ").trim() || (await askText("Project name", { validate: required }));
    await withDb((db) => assertNameFree(db, name));
    const fields = await resolveFields(flags);
    const project = await withDb((db) => createProject(db, { ...fields, name }));
    summary("project created", projectRows(project));
  },
  description: "create a project: add [name] [--path] [--folder] [--remote] (asked when missing)",
  name: "add"
});
