import type { Block } from "./table";

import { defineExport } from "./output";

const SEPARATOR = ";";
const BOM = "﻿";
const HEADER = [
  "Dia",
  "Início 1",
  "Fim 1",
  "Início 2",
  "Fim 2",
  "Total",
  "HE Início",
  "HE Fim",
  "HE Total",
  "Assunto",
  "Descrição"
];

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const hours = (value: number) => (value ? clock(Math.round(value * 60)) : "");
const edge = (block: Block | undefined, side: keyof Block) => (block ? clock(block[side]) : "");
const date = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const csv = defineExport({
  render: (table) => {
    const rows = table.lines.map((l) => [
      date(l.date),
      edge(l.first, "start"),
      edge(l.first, "end"),
      edge(l.second, "start"),
      edge(l.second, "end"),
      hours(l.regular),
      edge(l.extra, "start"),
      edge(l.extra, "end"),
      hours(l.overtime),
      l.subject,
      l.description
    ]);
    const total = ["Tempo Total", "", "", "", "", hours(table.regular), "", "", hours(table.overtime), "", ""];
    return BOM + [HEADER, ...rows, total].map((row) => row.map(field).join(SEPARATOR)).join("\r\n") + "\r\n";
  },
  note: "separador ponto e vírgula, UTF-8: abre direto no Excel em português",
  description: "export a month to .csv",
  ext: "csv"
});
