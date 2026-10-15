import { listProjects, findProject } from "../../db/projects";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { listDailies } from "../../db/dailies";
import { withDb } from "../../db";
import { br } from "./shared";

export const list = defineCommand({
  run: async (_args, flags) => {
    const { names, all } = await withDb(async (db) => {
      const project = flags.project?.trim() ? await findProject(db, flags.project) : undefined;
      const projects = await listProjects(db);
      return {
        names: new Map(projects.map((p) => [p.id, p.name])),
        all: await listDailies(db, project?.id)
      };
    });
    if (flags.json) return void process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
    if (!all.length) return info("nenhum apontamento. crie com: workbench daily add");
    summary(
      `apontamentos · ${all.length}`,
      all.map((e) => ({ detail: `${names.get(e.projectId) ?? "?"} · ${e.content.split("\n")[0]!}`, name: br(e.day) }))
    );
  },
  description: "list dailies, newest day first [--project] (--json for raw output)",
  aliases: ["ls"],
  name: "list"
});
