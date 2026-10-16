import { note } from "@clack/prompts";

import { parseMonth, type Entry, type Day, length, load } from "./data";
import { yellow, green, bold, cyan, dim } from "../../ui/color";
import { formatDuration, SHIFTS } from "../../lib/repo/clock";
import { startOfDay, brDay } from "../../lib/repo/dates";
import { defineCommand } from "../../lib/command";
import { info } from "../../ui/summary";

const BLOCK_MINUTES = 30;
const MAX_BLOCKS = 32;
const NAME_WIDTH = 60;
function bar(regular: number, overtime: number): string {
  const scale = Math.min(1, MAX_BLOCKS / Math.ceil((regular + overtime) / BLOCK_MINUTES || 1));
  const blocks = (minutes: number) => (minutes ? Math.max(1, Math.round((minutes / BLOCK_MINUTES) * scale)) : 0);
  return green("█".repeat(blocks(regular))) + yellow("█".repeat(blocks(overtime)));
}

const totals = (regular: number, overtime: number) =>
  [
    `${green("●")} regular ${bold(formatDuration(regular))}`,
    `${yellow("●")} overtime ${bold(formatDuration(overtime))}`,
    `total ${bold(formatDuration(regular + overtime))}`
  ].join(dim("  ·  "));

const weekday = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "short" }).replace(".", "");
const label = (date: Date) => `${weekday(date)}, ${brDay(date)}`;
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

const cell = (minutes: number, paint: (s: string) => string) => (minutes ? paint(bold(formatDuration(minutes))) : dim("—"));

const pad = (text: string, visible: number, width: number) => text + " ".repeat(Math.max(0, width - visible));
const visibleLength = (minutes: number) => (minutes ? formatDuration(minutes).length : 1);

function renderShifts(shifts: Day["shifts"]): string[] {
  const W = 10;
  const LABEL = 11;
  const header = `      ${dim(pad("", 0, LABEL))}${dim(pad("regular", 7, W))}${dim(pad("overtime", 8, W))}${dim("total")}`;
  const rows = SHIFTS.map((shift) => {
    const { overtime, regular } = shifts[shift.key];
    return `      ${pad(shift.label, shift.label.length, LABEL)}${pad(cell(regular, green), visibleLength(regular), W)}${pad(cell(overtime, yellow), visibleLength(overtime), W)}${cell(regular + overtime, (s) => s)}`;
  });
  return [header, ...rows];
}

function renderEntry({ project, times, daily }: Entry, date: Date): string[] {
  const text = daily.content.split("\n")[0]!.trim();
  const clipped = text.length > NAME_WIDTH ? `${text.slice(0, NAME_WIDTH - 1)}…` : text;
  const worked = times.reduce((total, t) => total + length(t), 0);
  const hours = worked ? dim(`  ·  ${formatDuration(worked)}`) : "";
  const head = `  ${cyan("▸")} ${bold(project.name)}${clipped ? `  ${dim(clipped)}` : ""}${hours}`;
  if (!times.length) {
    return [head, `      ${dim(`daily logged, no hours · use: time add ${brDay(date)}`)}`];
  }
  return [head];
}

function emptyReason(date: Date, today: Date): string {
  if (date > today) return "day that has not arrived yet";
  if (isWeekend(date)) return "weekend · no entries";
  return "no data · no daily logged on this day";
}

function renderDay(day: Day, today: Date): string[] {
  if (!day.entries.length) return [`${dim(`${label(day.date)}   ○ ${emptyReason(day.date, today)}`)}`];
  const worked = day.regular + day.overtime > 0;
  const head = `${bold(label(day.date))}   ${worked ? bar(day.regular, day.overtime) : dim("○ no hours logged")}`;
  const body = day.entries.flatMap((e) => renderEntry(e, day.date));
  if (!worked) return [head, ...body];
  return [head, `  ${totals(day.regular, day.overtime)}`, ...body, "", ...renderShifts(day.shifts)];
}

function renderSummary(days: Day[], today: Date) {
  const regular = days.reduce((total, d) => total + d.regular, 0);
  const overtime = days.reduce((total, d) => total + d.overtime, 0);
  const worked = days.filter((d) => d.regular + d.overtime > 0).length;
  const missing = days.filter((d) => !d.entries.length && !isWeekend(d.date) && d.date <= today).length;
  const row = (name: string, value: string) => `${dim(name.padEnd(24))}${value}`;
  note(
    [
      row("days with hours", bold(String(worked))),
      row("working days without a daily", missing ? yellow(bold(String(missing))) : green(bold("0"))),
      row("regular hours", green(bold(formatDuration(regular)))),
      row("overtime hours", yellow(bold(formatDuration(overtime)))),
      ...SHIFTS.map((shift) => {
        const minutes = days.reduce((t, d) => t + d.shifts[shift.key].regular + d.shifts[shift.key].overtime, 0);
        return row(`  ${shift.label}`, minutes ? formatDuration(minutes) : dim("—"));
      }),
      row("total", bold(formatDuration(regular + overtime)))
    ].join("\n"),
    "month summary"
  );
}

export const list = defineCommand({
  run: async (args, flags) => {
    const { month, year } = parseMonth(args[0]);
    const days = await load(flags, month, year);
    const today = startOfDay(new Date());

    if (flags.json) {
      const json = days.map((d) => ({
        dailies: d.entries.map((e) => ({ ...e.daily, project: e.project.name, times: e.times })),
        total: d.regular + d.overtime,
        overtime: d.overtime,
        regular: d.regular,
        shifts: d.shifts,
        day: d.date
      }));
      return void process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    }

    const title = new Date(year, month, 1).toLocaleDateString("en-GB", { year: "numeric", month: "long" });
    if (!days.some((d) => d.entries.length)) {
      info(`no data in ${title}: no daily logged. Log one with: workbench daily add`);
    }
    const blocks: { lines: string[]; filled: boolean }[] = [];
    for (let i = 0; i < days.length; i++) {
      const d = days[i]!;
      if (d.date > today) {
        const rest = days.slice(i);
        const range = `${weekday(d.date)}, ${brDay(d.date).slice(0, 5)} → ${weekday(rest.at(-1)!.date)}, ${brDay(rest.at(-1)!.date).slice(0, 5)}`;
        const text = `○ ${rest.length === 1 ? "day that has not arrived yet" : `${rest.length} days that have not arrived yet`}`;
        blocks.push({ lines: [dim(`${range}   ${text}`)], filled: false });
        break;
      }
      blocks.push({ filled: d.entries.length > 0, lines: renderDay(d, today) });
    }
    const lines = blocks.flatMap((b, i) => [...(i && (b.filled || blocks[i - 1]!.filled) ? [""] : []), ...b.lines]);
    note(lines.join("\n"), title);
    renderSummary(days, today);
    const missing = days.filter((d) => !d.entries.length && !isWeekend(d.date) && d.date <= today);
    if (missing.length)
      info(
        `working days without a daily: ${missing.map((d) => brDay(d.date).slice(0, 5)).join(", ")}. Log one with: workbench daily add`
      );
  },
  description: "monthly timesheet, day by day, with regular and overtime hours: list [MM/YYYY] [--project] [--json]",
  aliases: ["ls"],
  name: "list"
});
