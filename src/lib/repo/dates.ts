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
  return parsePtBrDate(input) ? undefined : "data inválida: use DD/MM/AAAA, uma data real e não futura";
}
