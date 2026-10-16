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
      const message = `a daily already exists on ${br(day)} in this project`;
      if (args[0]) throw new Error(`${message}; use update to edit it`);
      if (!(await askConfirm(`${message}. Edit it?`, true))) return info("cancelled");
      const content = await resolveContent(flags, existing.content);
      const result = await withDb((db) => updateDaily(db, existing, content));
      if (!result.changed) return info("nada mudou");
      return summary("daily updated", dailyRows(result.daily, project));
    }

    const content = await resolveContent(flags);
    const daily = await withDb((db) => createDaily(db, project.id, day, content));
    summary("daily created", dailyRows(daily, project));
  },
  description:
    "create the daily of a day in a project: add [DD/MM/YYYY] [--project] [--text] (picking a taken day offers to edit it)",
  name: "add"
});
