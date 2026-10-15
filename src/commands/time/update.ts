import { resolveDescription, resolveDaily, flagClock, flagKind, askClock, pickTime, timeRows, askKind } from "./shared";
import { type TimePatch, updateTime } from "../../db/times";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { withDb } from "../../db";

export const update = defineCommand({
  run: (args, flags) =>
    withDb(async (db) => {
      const { project, daily } = await resolveDaily(db, flags, args[0], "Em qual daily editar as horas?");
      const time = await pickTime(db, daily, "Qual lançamento editar?");

      const given = Boolean(flags.start?.trim() || flags.end?.trim() || flags.type?.trim() || flags.text !== undefined);
      let patch: TimePatch;
      if (given) {
        patch = {
          description: flags.text === undefined ? undefined : await resolveDescription(flags.text),
          startMinute: flags.start?.trim() ? flagClock("start", flags.start) : undefined,
          endMinute: flags.end?.trim() ? flagClock("end", flags.end) : undefined,
          kind: flags.type?.trim() ? flagKind(flags.type) : undefined
        };
      } else {
        const kind = await askKind(time.kind);
        const startMinute = await askClock("Hora de início (HH:MM)", time.startMinute);
        patch = {
          endMinute: await askClock("Hora de fim (HH:MM)", time.endMinute, startMinute),
          description: await resolveDescription(undefined, time.description),
          startMinute,
          kind
        };
      }

      const result = await updateTime(db, daily, time, patch);
      if (!result.changed) return info("nada mudou");
      summary("horas atualizadas", timeRows(result.time, daily, project));
    }),
  description: "edit a time entry: update [DD/MM/AAAA] [--project] [--start] [--end] [--type] [--text] (asks all when none)",
  aliases: ["edit"],
  name: "update"
});
