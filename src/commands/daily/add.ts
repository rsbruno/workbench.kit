import { resolveContent, resolveProject, resolveDay, dailyRows, br } from "./shared";
import { createDaily, updateDaily, listDailies } from "../../db/dailies";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { askConfirm } from "../../ui/prompt";
import { withDb } from "../../db";

export const add = defineCommand({
  run: async (args, flags) => {
    const { project, all } = await withDb(async (db) => {
      const project = await resolveProject(db, flags);
      return { all: await listDailies(db, project.id), project };
    });
    const day = await resolveDay(args[0], new Set(all.map((d) => d.day.getTime())));
    const existing = all.find((d) => d.day.getTime() === day.getTime());

    if (existing) {
      const message = `já existe um apontamento em ${br(day)} neste projeto`;
      if (args[0]) throw new Error(`${message}; use update para editar`);
      if (!(await askConfirm(`${message}. Editar?`, true))) return info("cancelado");
      const content = await resolveContent(flags, existing.content);
      const result = await withDb((db) => updateDaily(db, existing, content));
      if (!result.changed) return info("nada mudou");
      return summary("apontamento atualizado", dailyRows(result.daily, project));
    }

    const content = await resolveContent(flags);
    const daily = await withDb((db) => createDaily(db, project.id, day, content));
    summary("apontamento criado", dailyRows(daily, project));
  },
  description:
    "create the daily of a day in a project: add [DD/MM/AAAA] [--project] [--text] (picking a taken day offers to edit it)",
  name: "add"
});
