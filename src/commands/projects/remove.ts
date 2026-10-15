import { deleteProject } from "../../db/projects";
import { defineCommand } from "../../lib/command";
import { countCommits } from "../../db/commits";
import { askConfirm } from "../../ui/prompt";
import { info } from "../../ui/summary";
import { pickProject } from "./shared";
import { withDb } from "../../db";

export const remove = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const project = await pickProject(db, args[0], "Qual projeto remover?");
      const saved = await countCommits(db, project.id);
      const also = saved ? ` e os ${saved} commits salvos dele` : "";
      if (!flags.force && !(await askConfirm(`Remover "${project.name}"${also}? Isso não pode ser desfeito.`))) {
        return info("cancelado");
      }
      await deleteProject(db, project.id);
      info(`projeto "${project.name}" removido`);
    }),
  description: "delete a project: remove [name|id] (--force skips the confirmation)",
  aliases: ["rm"],
  name: "remove"
});
