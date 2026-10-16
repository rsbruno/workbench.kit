import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { listProjects } from "../../db/projects";
import { withDb } from "../../db";

export const list = defineCommand({
  run: async (_args, flags) => {
    const all = await withDb((db) => listProjects(db));
    if (flags.json) return void process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
    if (!all.length) return info("no projects. create one with: workbench projects add <name>");
    summary(
      `projects · ${all.length}`,
      all.map((p) => ({ detail: `${p.id} · ${p.createdAt}`, name: p.name }))
    );
  },
  description: "list projects, oldest first (--json for raw output)",
  aliases: ["ls"],
  name: "list"
});
