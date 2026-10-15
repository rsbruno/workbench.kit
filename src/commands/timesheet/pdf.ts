import type { Block } from "./table";

import { hoursAndMinutes, bannerTitle, isWeekend, WEEKDAYS, MONTHS, AUTHOR, HEX, rgb } from "./style";
import { type PdfColumn, type PdfCell, FONT_SIZE, type Rgb, buildPdf } from "../../lib/pdf";
import { formatClock } from "../../lib/repo/clock";
import { textWidth } from "../../lib/pdf-fonts";
import { LOGO_PNG } from "../../lib/pdf-logo";
import { defineExport } from "./output";

const NAVY: Rgb = rgb(HEX.navy);
const GOLD: Rgb = rgb(HEX.gold);
const WHITE: Rgb = rgb(HEX.white);
const BLACK: Rgb = rgb(HEX.black);
const LOGO_SIZE = 30;
const LOGO_RADIUS = 7;
const MUTED: Rgb = rgb(HEX.muted);
const DATE_WIDTH = Math.ceil(
  Math.max(...WEEKDAYS.flatMap((day) => MONTHS.map((month) => textWidth(`${day}, 30 de ${month} de 2026`, FONT_SIZE)))) + 6
);

const fixed = (width: number): PdfColumn => ({ width });
// Every hour column (times and totals) shares one width: the widest content it can hold plus a small breathing room.
const BREATH = 5;
const HOUR_CONTENT = [
  textWidth("744:00", FONT_SIZE),
  textWidth("Inicial", FONT_SIZE, true),
  textWidth("Início", FONT_SIZE, true),
  textWidth("Final", FONT_SIZE, true)
];
const HOUR = Math.ceil(Math.max(...HOUR_CONTENT) + BREATH);
const GAP = 6;
const COLUMNS: PdfColumn[] = [
  fixed(DATE_WIDTH),
  fixed(GAP),
  fixed(HOUR),
  fixed(HOUR),
  fixed(GAP),
  fixed(HOUR),
  fixed(HOUR),
  fixed(HOUR),
  fixed(GAP),
  fixed(HOUR),
  fixed(HOUR),
  fixed(HOUR),
  fixed(GAP),
  { flex: true, width: 0 }
];
const HEADER = [
  "Dia da semana",
  "",
  "Tempo\nInicial",
  "Tempo\nFinal",
  "",
  "Tempo\nInicial",
  "Tempo\nFinal",
  "Total",
  "",
  "HE\nInício",
  "HE\nFim",
  "Total",
  "",
  "Descrição"
];

const clock = (block: Block | undefined, side: keyof Block) => (block ? formatClock(block[side]) : "");
const decimal = (hours: number) => hours.toFixed(2).replace(".", ",");
const total = hoursAndMinutes;
const longDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", day: "numeric", month: "long" });

const spacer: PdfCell = { border: false, text: "" };
const none: PdfCell = { border: false, text: "" };

export const pdf = defineExport({
  render: (table, { projects, month, year }) =>
    buildPdf({
      rows: table.lines.map((l) => {
        const weekend = isWeekend(l.date);
        const fill = weekend ? GOLD : undefined;
        const ink = weekend ? BLACK : undefined;
        const time = (block: Block | undefined, side: keyof Block): PdfCell => ({
          color: weekend ? BLACK : NAVY,
          text: clock(block, side),
          align: "center",
          fill
        });
        const sum = (hours: number): PdfCell => ({ text: decimal(hours), align: "center", fill: GOLD, color: ink });
        const free = (text: string): PdfCell => ({ valign: "top", align: "left", color: ink, text, fill });
        return [
          { text: longDate(l.date), align: "right" },
          spacer,
          time(l.first, "start"),
          time(l.first, "end"),
          spacer,
          time(l.second, "start"),
          time(l.second, "end"),
          sum(l.regular),
          spacer,
          { ...time(l.extra, "start"), color: ink },
          { ...time(l.extra, "end"), color: ink },
          sum(l.overtime),
          spacer,
          free(l.report)
        ];
      }),
      footer: [
        none,
        none,
        { text: "Tempo Total", align: "center", span: 5 },
        { text: total(table.regular), align: "center", fill: GOLD },
        none,
        { text: "Tempo Total", align: "center", span: 2 },
        { text: total(table.overtime), align: "center", fill: GOLD },
        none,
        none
      ],
      banner: {
        title: bannerTitle(month, year),
        subtitle: projects.join(" · "),
        caption: AUTHOR,
        accent: NAVY,
        muted: MUTED
      },
      header: HEADER.map((text) => ({ align: "center", border: false, color: WHITE, fill: NAVY, bold: true, text })),
      logo: { radius: LOGO_RADIUS, size: LOGO_SIZE, png: LOGO_PNG },
      columns: COLUMNS,
      line: NAVY,
      ink: NAVY
    }),
  description: "export a month to .pdf (A4 landscape, same table as the xlsx)",
  ext: "pdf"
});
