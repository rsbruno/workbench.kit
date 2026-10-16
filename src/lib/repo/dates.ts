const PT_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function parsePtBrDate(input: string): string | null {
  const m = PT_BR.exec(input.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!real || date.getTime() > Date.now()) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function dateError(input: string): string | undefined {
  if (!input.trim()) return undefined;
  return parsePtBrDate(input) ? undefined : "invalid date: use DD/MM/YYYY, a real date that is not in the future";
}

const pad = (n: number) => String(n).padStart(2, "0");

export const brDay = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
