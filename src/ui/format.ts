export type Row = { name: string; detail: string };

export function alignRows(rows: Row[]): string[] {
  const width = Math.max(0, ...rows.map((r) => r.name.length));
  return rows.map((r) => `${r.name.padEnd(width)}   ${r.detail}`);
}
