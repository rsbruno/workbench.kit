import { writeFile, access, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";

import { MAX_OVERTIME_BLOCKS, MAX_REGULAR_BLOCKS, buildTable, type Table } from "./table";
import { defineCommand, type Command } from "../../lib/command";
import { summary, info, warn } from "../../ui/summary";
import { formatDuration } from "../../lib/repo/clock";
import { timesheetsDir } from "../../lib/paths";
import { parseMonth, load } from "./data";
import { exportFileName } from "./style";

export type Context = { month: number; year: number; name: string; projects: string[] };

type Format = {
  render: (table: Table, context: Context) => Buffer | string;
  description: string;
  note?: string;
  ext: string;
};

export function defineExport({ description, render, note, ext }: Format): Command {
  return defineCommand({
    run: async (args, flags) => {
      const { month, year } = parseMonth(args[0]);
      const days = await load(flags, month, year);
      if (!days.some((d) => d.entries.length)) throw new Error("nenhuma daily no mês; não há o que exportar");

      const table = buildTable(days);
      const projects = [...new Set(days.flatMap((d) => d.entries.map((e) => e.project.name)))];
      const file = flags.out?.trim()
        ? resolve(flags.out.trim())
        : join(timesheetsDir(), exportFileName(projects, month, year, ext));
      const exists = await access(file).then(
        () => true,
        () => false
      );
      if (exists && !flags.force) throw new Error(`o arquivo já existe: ${file} (use --force para sobrescrever)`);

      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, render(table, { name: `${String(month + 1).padStart(2, "0")}${year}`, projects, month, year }));
      summary(`${ext} gerado`, [
        { name: "arquivo", detail: file },
        { detail: formatDuration(Math.round(table.regular * 60)), name: "horas comuns" },
        { detail: formatDuration(Math.round(table.overtime * 60)), name: "horas extras" }
      ]);
      if (table.overflow.length) {
        warn(
          `o layout comporta ${MAX_REGULAR_BLOCKS} períodos comuns e ${MAX_OVERTIME_BLOCKS} de hora extra por dia; ` +
            `horas além disso não couberam em: ${table.overflow.join(", ")}`
        );
      }
      if (note) info(note);
    },
    description: `${description}: ${ext} [MM/AAAA] [--project] [--out file] [--force] (default: Documents/workbench/timesheets)`,
    name: ext
  });
}
