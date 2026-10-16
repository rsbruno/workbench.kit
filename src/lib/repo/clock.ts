export const DAY_MINUTES = 24 * 60;

export const TimeKind = { OVERTIME: 2, REGULAR: 1 } as const;

export type TimeKind = (typeof TimeKind)[keyof typeof TimeKind];

export const KIND_LABEL: Record<TimeKind, string> = {
  [TimeKind.OVERTIME]: "overtime",
  [TimeKind.REGULAR]: "regular"
};

const CLOCK = /^(\d{1,2})(?:[:h](\d{2})?)?$/;

export function parseClock(input: string): number | null {
  const m = CLOCK.exec(input.trim().toLowerCase());
  if (!m) return null;
  const [hours, minutes] = [Number(m[1]), Number(m[2] ?? 0)];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export const clockError = (input: string) =>
  parseClock(input) === null ? "invalid time: use HH:MM (e.g. 09:00, 9h30 or 14)" : undefined;

const pad = (n: number) => String(n).padStart(2, "0");

export const formatClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

export function parseKind(input: string): TimeKind | null {
  const value = input.trim().toLowerCase();
  if (["comum", "regular"].includes(value)) return TimeKind.REGULAR;
  if (["extra", "overtime"].includes(value)) return TimeKind.OVERTIME;
  return null;
}

export const SHIFTS = [
  { label: "morning", key: "morning", end: 12 * 60, start: 0 },
  { label: "afternoon", key: "afternoon", start: 12 * 60, end: 18 * 60 },
  { end: DAY_MINUTES, label: "night", start: 18 * 60, key: "night" }
] as const;

export type Shift = (typeof SHIFTS)[number];

export const overlap = (start: number, end: number, shift: Shift) =>
  Math.max(0, Math.min(end, shift.end) - Math.max(start, shift.start));
