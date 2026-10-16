import { resolveContent, resolveProject, pickDaily, dailyRows } from "./shared";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { updateDaily } from "../../db/dailies";
import { withDb } from "../../db";

export const update = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const project = await resolveProject(db, flags);
      const daily = await pickDaily(db, project, args[0], "Which daily should be edited?");
      const content = await resolveContent(flags, daily.content);
      const result = await updateDaily(db, daily, content);
      if (!result.changed) return info("nada mudou");
      summary("daily updated", dailyRows(result.daily, project));
    }),
  description: "edit the daily of a day: update [DD/MM/YYYY] [--project] [--text] (picks from the list when no date)",
  aliases: ["edit"],
  name: "update"
});
