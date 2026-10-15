import { formatDuration, KIND_LABEL, TimeKind } from "../../lib/repo/clock";
import { listProjects, findProject } from "../../db/projects";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { listDailies } from "../../db/dailies";
import { listTimes } from "../../db/times";
import { br } from "../daily/shared";
import { rangeOf } from "./shared";
import { withDb } from "../../db";

export const list = defineCommand({
  run: async (_args, flags) => {
    const { dailies, names, times } = await withDb(async (db) => {
      const project = flags.project?.trim() ? await findProject(db, flags.project) : undefined;
      const dailies = await listDailies(db, project?.id);
      return {
        times: await listTimes(
          db,
          dailies.map((d) => d.id)
        ),
        names: new Map((await listProjects(db)).map((p) => [p.id, p.name])),
        dailies
      };
    });
    if (flags.json) return void process.stdout.write(`${JSON.stringify(times, null, 2)}\n`);
    if (!times.length) return info("nenhum lançamento de hora. crie com: workbench time add");

    const length = (t: (typeof times)[number]) => t.endMinute - t.startMinute;
    const total = times.reduce((sum, t) => sum + length(t), 0);
    const extra = times.filter((t) => t.kind === TimeKind.OVERTIME).reduce((sum, t) => sum + length(t), 0);
    const rows = dailies.flatMap((d) =>
      times
        .filter((t) => t.dailyId === d.id)
        .map((t) => ({
          detail: [
            `${rangeOf(t)} (${formatDuration(length(t))})`,
            KIND_LABEL[t.kind],
            names.get(d.projectId) ?? "?",
            t.description
          ]
            .filter(Boolean)
            .join(" · "),
          name: br(d.day)
        }))
    );
    summary(
      `horas · ${times.length} lançamentos · total ${formatDuration(total)}${extra ? ` (extras ${formatDuration(extra)})` : ""}`,
      rows
    );
  },
  description: "list time entries, newest day first [--project] (--json for raw output)",
  aliases: ["ls"],
  name: "list"
});
