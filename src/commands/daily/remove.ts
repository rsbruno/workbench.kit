import { resolveProject, pickDaily, br } from "./shared";
import { defineCommand } from "../../lib/command";
import { deleteDaily } from "../../db/dailies";
import { askConfirm } from "../../ui/prompt";
import { countTimes } from "../../db/times";
import { info } from "../../ui/summary";
import { withDb } from "../../db";

export const remove = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const project = await resolveProject(db, flags);
      const daily = await pickDaily(db, project, args[0], "Qual apontamento remover?");
      const hours = await countTimes(db, daily.id);
      const also = hours ? ` e os ${hours} lançamentos de hora dela` : "";
      const question = `Remover o apontamento de ${br(daily.day)} em "${project.name}"${also}? Isso não pode ser desfeito.`;
      if (!flags.force && !(await askConfirm(question))) {
        return info("cancelado");
      }
      await deleteDaily(db, daily.id);
      info(`apontamento de ${br(daily.day)} removido`);
    }),
  description: "delete the daily of a day: remove [DD/MM/AAAA] [--project] (--force skips the confirmation)",
  aliases: ["rm"],
  name: "remove"
});
