import { resolveDescription, resolveDaily, flagClock, flagKind, askClock, timeRows, askKind } from "./shared";
import { defineCommand } from "../../lib/command";
import { createTime } from "../../db/times";
import { summary } from "../../ui/summary";
import { withDb } from "../../db";

export const add = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const { project, daily } = await resolveDaily(db, flags, args[0], "Which daily should the hours go to?");
      const kind = flags.type?.trim() ? flagKind(flags.type) : await askKind();
      const startMinute = flags.start?.trim() ? flagClock("start", flags.start) : await askClock("Start time (HH:MM)");
      const endMinute = flags.end?.trim()
        ? flagClock("end", flags.end)
        : await askClock("End time (HH:MM)", undefined, startMinute);
      const description = await resolveDescription(flags.text);
      const time = await createTime(db, daily, { description, startMinute, endMinute, kind });
      summary("hours logged", timeRows(time, daily, project));
    }),
  description:
    "log time on a daily: add [DD/MM/YYYY] [--project] [--start 09:00] [--end 12:30] [--type regular|overtime] [--text] (many per daily)",
  name: "add"
});
