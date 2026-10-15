import type { TimeEntry } from "../../db/schema";
import type { Day } from "./data";

import { TimeKind } from "../../lib/repo/clock";
import { brDay } from "../../lib/repo/dates";

export type Block = { start: number; end: number };

export type Line = {
  second?: Block;
  first?: Block;
  extra?: Block;
  description: string;
  report: string;
  subject: string;
  regular: number;
  overtime: number;
  date: Date;
};

export type Table = { overflow: string[]; overtime: number; regular: number; lines: Line[] };

export const MAX_REGULAR_BLOCKS = 2;
export const MAX_OVERTIME_BLOCKS = 1;

const hours = (blocks: Block[]) => Math.round((blocks.reduce((t, b) => t + b.end - b.start, 0) / 60) * 100) / 100;

function mergeBlocks(times: TimeEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const t of [...times].sort((a, b) => a.startMinute - b.startMinute)) {
    const last = blocks.at(-1);
    if (last && t.startMinute <= last.end) last.end = Math.max(last.end, t.endMinute);
    else blocks.push({ start: t.startMinute, end: t.endMinute });
  }
  return blocks;
}

export function buildTable(days: Day[]): Table {
  const overflow: string[] = [];
  const lines = days.map((day): Line => {
    const all = day.entries.flatMap((e) => e.times);
    const regular = mergeBlocks(all.filter((t) => t.kind === TimeKind.REGULAR));
    const overtime = mergeBlocks(all.filter((t) => t.kind === TimeKind.OVERTIME));
    if (regular.length > MAX_REGULAR_BLOCKS || overtime.length > MAX_OVERTIME_BLOCKS) overflow.push(brDay(day.date));

    const multiple = day.entries.length > 1;
    const [first, second] = regular;
    const [extra] = overtime;
    return {
      description: day.entries.map((e) => (multiple ? `${e.project.name}: ${e.daily.content}` : e.daily.content)).join("\n"),
      subject: day.entries.map((e) => `[${e.project.name}]`).join("\n"),
      report: day.entries.map((e) => e.daily.content).join("\n"),
      regular: hours(regular.slice(0, MAX_REGULAR_BLOCKS)),
      overtime: hours(extra ? [extra] : []),
      date: day.date,
      second,
      first,
      extra
    };
  });
  return {
    overtime: lines.reduce((t, l) => t + l.overtime, 0),
    regular: lines.reduce((t, l) => t + l.regular, 0),
    overflow,
    lines
  };
}
