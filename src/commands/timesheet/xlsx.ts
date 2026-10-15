import type { Block, Table } from "./table";

import { type Style, type Cell, buildXlsx, type Row } from "../../lib/xlsx";
import { bannerTitle, isWeekend, AUTHOR, HEX } from "./style";
import { textWidth } from "../../lib/pdf-fonts";
import { LOGO_PNG } from "../../lib/pdf-logo";
import { defineExport } from "./output";

// Excel cannot embed fonts: this is used when installed, otherwise Excel picks its own fallback.
const FONT = "Plus Jakarta Sans";
const LAST_COLUMN = "N";
const BANNER_ROWS = 3;
// 3 banner rows, 1 spacer and the header come first.
const FIRST_DATA_ROW = 6;

const GAP = 1.5;
const HOUR = 8;
const DESCRIPTION = 100;
const WIDTHS = [36, GAP, HOUR, HOUR, GAP, HOUR, HOUR, HOUR, GAP, HOUR, HOUR, HOUR, GAP, DESCRIPTION];

const LINE_HEIGHT = 12;
const ROW_PADDING = 4;
const PIXELS_PER_CHAR = 7;
const TEXT_PIXELS = 12;

const EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const DATE_FORMAT = 'dddd", "d" de "mmmm" de "yyyy';

const serial = (date: Date) => Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH) / DAY_MS);

const hoursFormula = (r: number) =>
  `ROUND(IF(OR(D${r}="",C${r}=""),0,IF(D${r}<C${r},((D${r}-C${r})*24)+24,(D${r}-C${r})*24))+IF(OR(G${r}="",F${r}=""),0,IF(G${r}<F${r},((G${r}-F${r})*24)+24,(G${r}-F${r})*24)),2)`;
const overtimeFormula = (r: number) =>
  `ROUND(IF(OR(K${r}="",J${r}=""),0,IF(K${r}<J${r},((K${r}-J${r})*24)+24,(K${r}-J${r})*24)),2)`;

const centered = (style: Style = {}): Style => ({ ...style, align: "center" });

const HEADER_STYLE: Style = { color: HEX.white, align: "center", fill: HEX.navy, bold: true, wrap: true };
const HEADERS: Record<string, string> = {
  C: "Tempo\nInicial",
  F: "Tempo\nInicial",
  A: "Dia da semana",
  D: "Tempo\nFinal",
  G: "Tempo\nFinal",
  J: "HE\nInício",
  N: "Descrição",
  K: "HE\nFim",
  H: "Total",
  L: "Total"
};

function lineCount(text: string): number {
  const room = DESCRIPTION * PIXELS_PER_CHAR;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let line = "";
    lines++;
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, TEXT_PIXELS) > room) {
        lines++;
        line = word;
      } else line = next;
    }
  }
  return lines;
}

function dayRow(line: Table["lines"][number], row: number): Row {
  const weekend = isWeekend(line.date);
  const base: Style = { color: weekend ? HEX.black : HEX.navy, fill: weekend ? HEX.gold : undefined, border: HEX.navy };
  const hour = (col: string, block: Block | undefined, side: keyof Block): Cell => ({
    value: block ? block[side] / 1440 : undefined,
    style: centered({ ...base, numFmt: "hh:mm" }),
    col
  });
  const total = (col: string, formula: string, value: number): Cell => ({
    style: centered({ ...base, fill: HEX.gold, numFmt: "0.00" }),
    formula,
    value,
    col
  });
  const lines = lineCount(line.report);
  return {
    cells: [
      {
        style: { ...base, numFmt: DATE_FORMAT, color: base.color, fill: undefined, align: "right" },
        value: serial(line.date),
        col: "A"
      },
      hour("C", line.first, "start"),
      hour("D", line.first, "end"),
      hour("F", line.second, "start"),
      hour("G", line.second, "end"),
      total("H", hoursFormula(row), line.regular),
      hour("J", line.extra, "start"),
      hour("K", line.extra, "end"),
      total("L", overtimeFormula(row), line.overtime),
      { style: { ...base, align: "left", valign: "top", wrap: true }, value: line.report || undefined, col: "N" }
    ],
    height: Math.max(16, lines * LINE_HEIGHT + ROW_PADDING)
  };
}

export function xlsxSheet(table: Table, title: string, projects: string[], name: string) {
  const banner = (value: string, style: Style, height: number): Row => ({
    cells: [{ style: centered(style), col: "A", value }],
    height
  });
  const header: Row = {
    cells: "ABCDEFGHIJKLMN".split("").map((col) => ({ style: HEADER_STYLE, value: HEADERS[col], col })),
    height: 30
  };
  const days = table.lines.map((line, i) => dayRow(line, FIRST_DATA_ROW + i));
  const first = FIRST_DATA_ROW;
  const last = FIRST_DATA_ROW + table.lines.length - 1;
  const footerRow = last + 1;
  const edge: Style = { border: HEX.navy, align: "center" };
  const sum: Style = { ...edge, numFmt: "[h]:mm", fill: HEX.gold };

  const rows: Row[] = [
    banner(title, { color: HEX.navy, bold: true, size: 13 }, 22),
    banner(projects.join(" · "), { color: HEX.navy, size: 10 }, 16),
    banner(AUTHOR, { color: HEX.muted, size: 8.5 }, 14),
    { cells: [], height: 6 },
    header,
    ...days,
    {
      cells: [
        { value: "Tempo Total", style: edge, col: "C" },
        ...["D", "E", "F", "G"].map((col) => ({ style: edge, col })),
        { formula: `SUM(H${first}:H${last})/24`, value: table.regular / 24, style: sum, col: "H" },
        { value: "Tempo Total", style: edge, col: "J" },
        { style: edge, col: "K" },
        { formula: `SUM(L${first}:L${last})/24`, value: table.overtime / 24, style: sum, col: "L" }
      ],
      height: 16
    }
  ];
  const merges = [
    ...Array.from({ length: BANNER_ROWS }, (_, i) => `A${i + 1}:${LAST_COLUMN}${i + 1}`),
    `C${footerRow}:G${footerRow}`,
    `J${footerRow}:K${footerRow}`
  ];
  return {
    logo: { radius: 23_000, png: LOGO_PNG, height: 40, width: 40 },
    widths: WIDTHS,
    font: FONT,
    merges,
    name,
    rows
  };
}

export const xlsx = defineExport({
  render: (table, { projects, month, name, year }) => buildXlsx(xlsxSheet(table, bannerTitle(month, year), projects, name)),
  note: "as colunas Total são fórmulas e a fonte é a Plus Jakarta Sans (se não estiver instalada, o Excel usa outra)",
  description: "export a month to .xlsx (same look as the PDF)",
  ext: "xlsx"
});
