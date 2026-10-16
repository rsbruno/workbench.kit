import { TimeKind as Kind, type TimeKind, DAY_MINUTES } from "./clock";

export const WORKDAY_MINUTES = 8 * 60;
export const LUNCH_START = 12 * 60;
export const LUNCH_END = 13 * 60;
/** Anything worked after this hour is overtime, whatever the hours already done. */
export const REGULAR_UNTIL = 18 * 60;
export const MAX_SPAN_HOURS = 16;

const ROUND_UP_FROM = 45;
const formatHours = (minutes: number) => `${minutes / 60}h`;
const MINUTES_PER_HOUR = 60;

export type Block = { startMinute: number; endMinute: number; kind: TimeKind };

/** Whole hours of the day: the first and the last commit, rounded with the "45" rule. */
export type Anchors = { first: number; last: number };

export type Estimate = { startHour: number; endHour: number };

/** Minutes below 45 round down, 45 or more round up: 21:44 is 21h and 21:45 is 22h. */
export const roundHour = (minutes: number) =>
  Math.floor(minutes / MINUTES_PER_HOUR) + (minutes % MINUTES_PER_HOUR >= ROUND_UP_FROM ? 1 : 0);

/** Minute of the day of an ISO timestamp, read from the author's own clock (`2026-09-02T09:10:00-03:00`). */
export const minuteOfDay = (iso: string) => Number(iso.slice(11, 13)) * MINUTES_PER_HOUR + Number(iso.slice(14, 16));

export function anchorsOf(minutes: number[]): Anchors {
  const first = Math.min(roundHour(Math.min(...minutes)), 23);
  const last = Math.min(roundHour(Math.max(...minutes)), 24);
  return { last: Math.max(last, first + 1), first };
}

/** The hour at which `net` working minutes are done when starting at `startHour`, skipping the lunch. */
function finishHour(startHour: number, net = WORKDAY_MINUTES): number {
  let minute = startHour * MINUTES_PER_HOUR;
  let left = net;
  while (left > 0 && minute < DAY_MINUTES) {
    if (minute >= LUNCH_START && minute < LUNCH_END) minute = LUNCH_END;
    const limit = minute < LUNCH_START ? LUNCH_START : DAY_MINUTES;
    const step = Math.min(left, limit - minute);
    minute += step;
    left -= step;
  }
  return Math.min(Math.ceil(minute / MINUTES_PER_HOUR), 24);
}

/** Used when the agent gives no usable answer: starts at the first commit and runs the 8 hours. */
export function fallbackEstimate({ first, last }: Anchors): Estimate {
  return { endHour: Math.max(finishHour(first), last), startHour: first };
}

/** Minutes worked between two hours of the day, not counting the lunch. */
export function netMinutes({ startHour, endHour }: Estimate): number {
  const start = startHour * MINUTES_PER_HOUR;
  const end = endHour * MINUTES_PER_HOUR;
  const lunch = Math.max(0, Math.min(end, LUNCH_END) - Math.max(start, LUNCH_START));
  return Math.max(0, end - start - lunch);
}

export function validateEstimate({ startHour, endHour }: Estimate, { first, last }: Anchors): string | undefined {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return "as horas devem ser inteiras";
  if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24) return "início entre 0 e 23 e fim entre 1 e 24";
  if (endHour <= startHour) return "o fim deve ser depois do início";
  if (endHour - startHour > MAX_SPAN_HOURS) return `o dia não pode passar de ${MAX_SPAN_HOURS}h`;
  if (startHour > first) return `o início não pode ser depois do primeiro commit (${first}h)`;
  if (endHour < last) return `o fim não pode ser antes do último commit (${last}h)`;

  // Time beyond the commits only exists to complete the 8h day, never more than that.
  const allowed = Math.max(WORKDAY_MINUTES, netMinutes({ startHour: first, endHour: last }));
  if (netMinutes({ startHour, endHour }) > allowed) {
    return `não acrescente horas além dos commits: só é permitido ir além deles para fechar as 8h (no máximo ${formatHours(allowed)} de trabalho; sem mais informação, use ${first}h a ${last}h)`;
  }
  return undefined;
}

/**
 * Splits a day into blocks around the lunch. Time is regular up to 18:00 and within the first 8 net hours;
 * whatever is past 18:00, or past those 8 hours, is overtime.
 */
export function toBlocks({ startHour, endHour }: Estimate): Block[] {
  const start = startHour * MINUTES_PER_HOUR;
  const end = endHour * MINUTES_PER_HOUR;
  const segments: [number, number][] = [];
  if (start < LUNCH_START) segments.push([start, Math.min(end, LUNCH_START)]);
  if (end > LUNCH_END) segments.push([Math.max(start, LUNCH_END), end]);

  const blocks: Block[] = [];
  let regular = WORKDAY_MINUTES;
  for (const [from, to] of segments.filter(([a, b]) => b > a)) {
    const normal = Math.min(Math.max(0, Math.min(to, REGULAR_UNTIL) - from), regular);
    regular -= normal;
    if (normal > 0) blocks.push({ endMinute: from + normal, kind: Kind.REGULAR, startMinute: from });
    if (from + normal < to) blocks.push({ startMinute: from + normal, kind: Kind.OVERTIME, endMinute: to });
  }
  return blocks;
}

export const sortBlocks = (blocks: Block[]) => [...blocks].sort((a, b) => a.startMinute - b.startMinute);

export function validateBlocks(blocks: Block[]): string | undefined {
  const sorted = sortBlocks(blocks);
  for (const [i, block] of sorted.entries()) {
    if (block.startMinute < 0 || block.endMinute > DAY_MINUTES || block.endMinute <= block.startMinute) {
      return "cada bloco precisa terminar depois de começar, dentro do mesmo dia";
    }
    if (i > 0 && block.startMinute < sorted[i - 1]!.endMinute) return "os blocos do dia não podem se sobrepor";
  }
  return undefined;
}

export const replaceBlock = (blocks: Block[], index: number, block: Block) =>
  sortBlocks(blocks.map((b, i) => (i === index ? block : b)));

export const appendBlock = (blocks: Block[], block: Block) => sortBlocks([...blocks, block]);

export const removeBlockAt = (blocks: Block[], index: number) => blocks.filter((_, i) => i !== index);

export function totalsOf(blocks: Block[]): { extra: number; regular: number } {
  let regular = 0;
  let extra = 0;
  for (const { startMinute, endMinute, kind } of blocks) {
    if (kind === Kind.OVERTIME) extra += endMinute - startMinute;
    else regular += endMinute - startMinute;
  }
  return { regular, extra };
}
