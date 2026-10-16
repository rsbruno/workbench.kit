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
      const daily = await pickDaily(db, project, args[0], "Which daily should be removed?");
      const hours = await countTimes(db, daily.id);
      const also = hours ? ` and its ${hours} time entries` : "";
      const question = `Remove the daily of ${br(daily.day)} in "${project.name}"${also}? This cannot be undone.`;
      if (!flags.force && !(await askConfirm(question))) {
        return info("cancelado");
      }
      await deleteDaily(db, daily.id);
      info(`daily of ${br(daily.day)} removed`);
    }),
  description: "delete the daily of a day: remove [DD/MM/YYYY] [--project] (--force skips the confirmation)",
  aliases: ["rm"],
  name: "remove"
});
