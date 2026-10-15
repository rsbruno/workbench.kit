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
      const { daily } = await resolveDaily(db, flags, args[0], "De qual daily remover as horas?");
      const time = await pickTime(db, daily, "Qual lançamento remover?");
      const label = `${rangeOf(time)} de ${br(daily.day)}`;
      if (!flags.force && !(await askConfirm(`Remover o lançamento de ${label}? Isso não pode ser desfeito.`))) {
        return info("cancelado");
      }
      await deleteTime(db, time.id);
      info(`lançamento de ${label} removido`);
    }),
  description: "delete a time entry: remove [DD/MM/AAAA] [--project] (--force skips the confirmation)",
  aliases: ["rm"],
  name: "remove"
});
