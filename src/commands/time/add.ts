import { resolveDaily, flagClock, flagKind, askClock, timeRows, askKind } from "./shared";
import { defineCommand } from "../../lib/command";
import { createTime } from "../../db/times";
import { summary } from "../../ui/summary";
import { askText } from "../../ui/prompt";
import { withDb } from "../../db";

export const add = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const { project, daily } = await resolveDaily(db, flags, args[0], "Em qual daily lançar as horas?");
      const kind = flags.type?.trim() ? flagKind(flags.type) : await askKind();
      const startMinute = flags.start?.trim() ? flagClock("start", flags.start) : await askClock("Hora de início (HH:MM)");
      const endMinute = flags.end?.trim()
        ? flagClock("end", flags.end)
        : await askClock("Hora de fim (HH:MM)", undefined, startMinute);
      const description = flags.text !== undefined ? flags.text : await askText("Descrição (opcional)");
      const time = await createTime(db, daily, { description, startMinute, endMinute, kind });
      summary("horas lançadas", timeRows(time, daily, project));
    }),
  description:
    "log time on a daily: add [DD/MM/AAAA] [--project] [--start 09:00] [--end 12:30] [--type comum|extra] [--text] (many per daily)",
  name: "add"
});
