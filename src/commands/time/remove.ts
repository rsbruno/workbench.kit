import { resolveDaily, pickTime, rangeOf } from "./shared";
import { defineCommand } from "../../lib/command";
import { askConfirm } from "../../ui/prompt";
import { deleteTime } from "../../db/times";
import { info } from "../../ui/summary";
import { br } from "../daily/shared";
import { withDb } from "../../db";

export const remove = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const { daily } = await resolveDaily(db, flags, args[0], "Which daily should the hours be removed from?");
      const time = await pickTime(db, daily, "Which entry should be removed?");
      const label = `${rangeOf(time)} de ${br(daily.day)}`;
      if (!flags.force && !(await askConfirm(`Remove the entry of ${label}? This cannot be undone.`))) {
        return info("cancelado");
      }
      await deleteTime(db, time.id);
      info(`entry of ${label} removed`);
    }),
  description: "delete a time entry: remove [DD/MM/YYYY] [--project] (--force skips the confirmation)",
  aliases: ["rm"],
  name: "remove"
});
