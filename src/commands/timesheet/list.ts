import { note } from "@clack/prompts";

import type { TimeEntry, Project, Daily } from "../../db/schema";

import { formatDuration, type Shift, TimeKind, overlap, SHIFTS } from "../../lib/repo/clock";
import { yellow, green, bold, cyan, dim } from "../../ui/color";
import { defineCommand, type Flags } from "../../lib/command";
import { listProjects, findProject } from "../../db/projects";
import { startOfDay, brDay } from "../../lib/repo/dates";
import { listDailies } from "../../db/dailies";
import { listTimes } from "../../db/times";
import { info } from "../../ui/summary";
import { withDb } from "../../db";

type Entry = { times: TimeEntry[]; project: Project; daily: Daily };
type Split = { overtime: number; regular: number };
type Day = Split & { shifts: Record<Shift["key"], Split>; entries: Entry[]; date: Date };

const BLOCK_MINUTES = 30;
const MAX_BLOCKS = 32;
const NAME_WIDTH = 60;
const MONTH = /^(\d{1,2})\/(\d{4})$/;

const length = (t: TimeEntry) => t.endMinute - t.startMinute;
const sum = (times: TimeEntry[], kind: TimeKind) =>
  times.filter((t) => t.kind === kind).reduce((total, t) => total + length(t), 0);

function parseMonth(input: string | undefined): { month: number; year: number } {
  if (!input) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  const m = MONTH.exec(input.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new Error("mês inválido: use MM/AAAA (ex.: 10/2026)");
  return { month: Number(m[1]) - 1, year: Number(m[2]) };
}

function bar(regular: number, overtime: number): string {
  const scale = Math.min(1, MAX_BLOCKS / Math.ceil((regular + overtime) / BLOCK_MINUTES || 1));
  const blocks = (minutes: number) => (minutes ? Math.max(1, Math.round((minutes / BLOCK_MINUTES) * scale)) : 0);
  return green("█".repeat(blocks(regular))) + yellow("█".repeat(blocks(overtime)));
}

const totals = (regular: number, overtime: number) =>
  [
    `${green("●")} comum ${bold(formatDuration(regular))}`,
    `${yellow("●")} extra ${bold(formatDuration(overtime))}`,
    `total ${bold(formatDuration(regular + overtime))}`
  ].join(dim("  ·  "));

const weekday = (date: Date) => date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
const label = (date: Date) => `${weekday(date)}, ${brDay(date)}`;
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

function shiftSplit(times: TimeEntry[], shift: Shift): Split {
  const minutes = (kind: TimeKind) =>
    times.filter((t) => t.kind === kind).reduce((total, t) => total + overlap(t.startMinute, t.endMinute, shift), 0);
  return { overtime: minutes(TimeKind.OVERTIME), regular: minutes(TimeKind.REGULAR) };
}

const cell = (minutes: number, paint: (s: string) => string) => (minutes ? paint(bold(formatDuration(minutes))) : dim("—"));

const pad = (text: string, visible: number, width: number) => text + " ".repeat(Math.max(0, width - visible));
const visibleLength = (minutes: number) => (minutes ? formatDuration(minutes).length : 1);

function renderShifts(shifts: Day["shifts"]): string[] {
  const W = 8;
  const header = `      ${dim(pad("", 0, 8))}${dim(pad("comum", 5, W))}${dim(pad("extra", 5, W))}${dim("total")}`;
  const rows = SHIFTS.map((shift) => {
    const { overtime, regular } = shifts[shift.key];
    return `      ${pad(shift.label, shift.label.length, 8)}${pad(cell(regular, green), visibleLength(regular), W)}${pad(cell(overtime, yellow), visibleLength(overtime), W)}${cell(regular + overtime, (s) => s)}`;
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
    return [head, `      ${dim(`daily lançada, sem horas · use: time add ${brDay(date)}`)}`];
  }
  return [head];
}

function emptyReason(date: Date, today: Date): string {
  if (date > today) return "dia que ainda não chegou";
  if (isWeekend(date)) return "fim de semana · sem lançamentos";
  return "sem dados · nenhuma daily lançada neste dia";
}

function renderDay(day: Day, today: Date): string[] {
  if (!day.entries.length) return [`${dim(`${label(day.date)}   ○ ${emptyReason(day.date, today)}`)}`];
  const worked = day.regular + day.overtime > 0;
  const head = `${bold(label(day.date))}   ${worked ? bar(day.regular, day.overtime) : dim("○ sem horas lançadas")}`;
  const body = day.entries.flatMap((e) => renderEntry(e, day.date));
  if (!worked) return [head, ...body];
  return [head, `  ${totals(day.regular, day.overtime)}`, ...body, "", ...renderShifts(day.shifts)];
}

async function load(flags: Flags, month: number, year: number): Promise<Day[]> {
  return withDb(async (db) => {
    const project = flags.project?.trim() ? await findProject(db, flags.project) : undefined;
    const projects = new Map((await listProjects(db)).map((p) => [p.id, p]));
    const first = new Date(year, month, 1);
    const next = new Date(year, month + 1, 1);
    const dailies = (await listDailies(db, project?.id)).filter((d) => d.day >= first && d.day < next);
    const times = await listTimes(
      db,
      dailies.map((d) => d.id)
    );

    const days: Day[] = [];
    for (let date = new Date(first); date < next; date.setDate(date.getDate() + 1)) {
      const at = new Date(date);
      const entries: Entry[] = dailies
        .filter((d) => d.day.getTime() === at.getTime())
        .map((daily) => ({
          times: times.filter((t) => t.dailyId === daily.id).sort((a, b) => a.startMinute - b.startMinute),
          project: projects.get(daily.projectId)!,
          daily
        }));
      const all = entries.flatMap((e) => e.times);
      days.push({
        shifts: Object.fromEntries(SHIFTS.map((shift) => [shift.key, shiftSplit(all, shift)])) as Day["shifts"],
        overtime: sum(all, TimeKind.OVERTIME),
        regular: sum(all, TimeKind.REGULAR),
        date: at,
        entries
      });
    }
    return days;
  });
}

function renderSummary(days: Day[], today: Date) {
  const regular = days.reduce((total, d) => total + d.regular, 0);
  const overtime = days.reduce((total, d) => total + d.overtime, 0);
  const worked = days.filter((d) => d.regular + d.overtime > 0).length;
  const missing = days.filter((d) => !d.entries.length && !isWeekend(d.date) && d.date <= today).length;
  const row = (name: string, value: string) => `${dim(name.padEnd(24))}${value}`;
  note(
    [
      row("dias com horas", bold(String(worked))),
      row("dias úteis sem daily", missing ? yellow(bold(String(missing))) : green(bold("0"))),
      row("horas comuns", green(bold(formatDuration(regular)))),
      row("horas extras", yellow(bold(formatDuration(overtime)))),
      ...SHIFTS.map((shift) => {
        const minutes = days.reduce((t, d) => t + d.shifts[shift.key].regular + d.shifts[shift.key].overtime, 0);
        return row(`  ${shift.label}`, minutes ? formatDuration(minutes) : dim("—"));
      }),
      row("total", bold(formatDuration(regular + overtime)))
    ].join("\n"),
    "resumo do mês"
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

    const title = new Date(year, month, 1).toLocaleDateString("pt-BR", { year: "numeric", month: "long" });
    if (!days.some((d) => d.entries.length)) {
      info(`sem dados em ${title}: nenhuma daily lançada. Lance com: workbench daily add`);
    }
    const blocks: { lines: string[]; filled: boolean }[] = [];
    for (let i = 0; i < days.length; i++) {
      const d = days[i]!;
      if (d.date > today) {
        const rest = days.slice(i);
        const range = `${weekday(d.date)}, ${brDay(d.date).slice(0, 5)} → ${weekday(rest.at(-1)!.date)}, ${brDay(rest.at(-1)!.date).slice(0, 5)}`;
        const text = `○ ${rest.length === 1 ? "dia que ainda não chegou" : `${rest.length} dias que ainda não chegaram`}`;
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
      info(`dias úteis sem daily: ${missing.map((d) => brDay(d.date).slice(0, 5)).join(", ")}. Lance com: workbench daily add`);
  },
  description: "monthly timesheet, day by day, with common and overtime hours: list [MM/AAAA] [--project] [--json]",
  aliases: ["ls"],
  name: "list"
});
