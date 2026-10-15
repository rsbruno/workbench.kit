import { deflateSync } from "node:zlib";

import { type PdfFont, textWidth, MEDIUM, BOLD } from "./pdf-fonts";
import { decodePng } from "./png";

export type Rgb = [number, number, number];

export type PdfCell = {
  valign?: "middle" | "top";
  align?: "center" | "right" | "left";
  border?: boolean;
  bold?: boolean;
  color?: Rgb;
  fill?: Rgb;
  span?: number;
  text: string;
};

export type PdfColumn = { flex?: boolean; width: number };

export type PdfBanner = { accent: Rgb; caption: string; muted: Rgb; subtitle: string; title: string };

export type PdfLogo = { png: Buffer; radius: number; size: number };

export type PdfGrid = {
  banner?: PdfBanner;
  columns: PdfColumn[];
  footer: PdfCell[];
  header: PdfCell[];
  ink: Rgb;
  line: Rgb;
  logo?: PdfLogo;
  rows: PdfCell[][];
};

export const FONT_SIZE = 6.8;

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN_X = 50;
const MARGIN_TOP = 70;
const LOGO_MARGIN = 22;
const TITLE_SIZE = 11;
const TITLE_SPACING = 0.4;
const SUBTITLE_SIZE = 8.5;
const CAPTION_SIZE = 7.5;
const BEZIER = 0.5523;
const MARGIN_BOTTOM = 36;
const LEADING = 8.6;
const PAD_X = 2.5;
const PAD_Y = 1.7;
const LINE_WIDTH = 0.4;
const CENTER_OFFSET = 0.36;

function wrap(text: string, width: number, bold: boolean): string[] {
  const fits = (value: string) => textWidth(value, FONT_SIZE, bold) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      let rest = word;
      while (!fits(rest) && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      if (!line) line = rest;
      else if (fits(`${line} ${rest}`)) line += ` ${rest}`;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

const n = (value: number) => value.toFixed(2);

const color = ([r, g, b]: Rgb) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;

export function buildPdf({ columns, banner, footer, header, line, logo, rows, ink }: PdfGrid): Buffer {
  const widths = columns.map((c) => c.width);
  const flex = columns.findIndex((c) => c.flex);
  widths[flex] = PAGE_WIDTH - MARGIN_X * 2 - widths.reduce((total, w, i) => (i === flex ? total : total + w), 0);
  const starts = widths.map((_, i) => MARGIN_X + widths.slice(0, i).reduce((total, w) => total + w, 0));
  const right = MARGIN_X + widths.reduce((total, w) => total + w, 0);
  const maxLines = Math.floor((PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / LEADING) - 6;

  const pages: string[][] = [];
  let page: string[] = [];
  let top = 0;

  // Glyphs used per font (glyph id -> code point), for the width table and the copy/search map.
  const used = { medium: new Map<number, number>(), bold: new Map<number, number>() };

  function textOps(value: string, x: number, y: number, size: number, rgb: Rgb, weight: "medium" | "bold", spacing = 0) {
    const bold = weight === "bold";
    const [font, glyphs] = bold ? [BOLD, used.bold] : [MEDIUM, used.medium];
    let hex = "";
    for (const ch of value) {
      const code = font.drawn(ch.codePointAt(0)!);
      const glyph = font.glyph(code);
      glyphs.set(glyph, code);
      hex += glyph.toString(16).padStart(4, "0");
    }
    return `${color(rgb)} rg BT /F${bold ? 2 : 1} ${size} Tf ${spacing} Tc ${n(x)} ${n(y)} Td <${hex}> Tj ET`;
  }

  function layout(cells: PdfCell[]) {
    let col = 0;
    return cells.map((cell) => {
      const span = cell.span ?? 1;
      const width = widths.slice(col, col + span).reduce((total, w) => total + w, 0);
      const placed = { x: starts[col]!, width, cell };
      col += span;
      return placed;
    });
  }

  const wrapped = (cell: PdfCell, width: number) => wrap(cell.text, width - PAD_X * 2, Boolean(cell.bold)).slice(0, maxLines);

  function rowHeight(cells: PdfCell[]) {
    const lines = Math.max(1, ...layout(cells).map(({ width, cell }) => wrapped(cell, width).length));
    return lines * LEADING + PAD_Y * 2;
  }

  function drawRow(cells: PdfCell[]) {
    const height = rowHeight(cells);
    const bottom = top - height;
    for (const { width, cell, x } of layout(cells)) {
      if (cell.fill) page.push(`${color(cell.fill)} rg ${n(x)} ${n(bottom)} ${n(width)} ${n(height)} re f`);
      if (cell.border !== false) {
        page.push(`${color(line)} RG ${LINE_WIDTH} w ${n(x)} ${n(bottom)} ${n(width)} ${n(height)} re S`);
      }
      const lines = wrapped(cell, width);
      const block = lines.length * LEADING;
      const offset = cell.valign === "top" ? PAD_Y : (height - block) / 2;
      lines.forEach((value, k) => {
        const w = textWidth(value, FONT_SIZE, Boolean(cell.bold));
        const align = cell.align ?? "left";
        const px = align === "center" ? x + (width - w) / 2 : align === "right" ? x + width - PAD_X - w : x + PAD_X;
        const py = top - offset - k * LEADING - LEADING / 2 - FONT_SIZE * CENTER_OFFSET;
        page.push(textOps(value, px, py, FONT_SIZE, cell.color ?? ink, cell.bold ? "bold" : "medium"));
      });
    }
    top = bottom;
  }

  function drawLogo({ radius: r, size: w }: PdfLogo) {
    const [x, y] = [MARGIN_X, PAGE_HEIGHT - LOGO_MARGIN - w];
    const k = r * BEZIER;
    page.push(
      [
        "q",
        `${n(x + r)} ${n(y)} m ${n(x + w - r)} ${n(y)} l`,
        `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
        `${n(x + w)} ${n(y + w - r)} l`,
        `${n(x + w)} ${n(y + w - r + k)} ${n(x + w - r + k)} ${n(y + w)} ${n(x + w - r)} ${n(y + w)} c`,
        `${n(x + r)} ${n(y + w)} l`,
        `${n(x + r - k)} ${n(y + w)} ${n(x)} ${n(y + w - r + k)} ${n(x)} ${n(y + w - r)} c`,
        `${n(x)} ${n(y + r)} l`,
        `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
        `h W n ${n(w)} 0 0 ${n(w)} ${n(x)} ${n(y)} cm /Im1 Do Q`
      ].join("\n")
    );
  }

  /** Draws a line of text centered on the page; `spacing` is extra space between letters. */
  function centered(value: string, y: number, size: number, rgb: Rgb, weight: "medium" | "bold", spacing = 0) {
    const bold = weight === "bold";
    const text = fit(value, size, bold, right - MARGIN_X - spacing * value.length);
    const width = textWidth(text, size, bold) + spacing * (text.length - 1);
    page.push(textOps(text, (PAGE_WIDTH - width) / 2, y, size, rgb, weight, spacing));
  }

  function fit(value: string, size: number, bold: boolean, max: number) {
    if (textWidth(value, size, bold) <= max) return value;
    let cut = value.length;
    while (cut > 1 && textWidth(`${value.slice(0, cut)}…`, size, bold) > max) cut--;
    return `${value.slice(0, cut)}…`;
  }

  function drawBanner({ subtitle, caption, accent, muted, title }: PdfBanner) {
    const top = PAGE_HEIGHT - LOGO_MARGIN;
    centered(title, top - 11, TITLE_SIZE, accent, "bold", TITLE_SPACING);
    centered(subtitle, top - 22, SUBTITLE_SIZE, ink, "medium");
    centered(caption, top - 32, CAPTION_SIZE, muted, "medium");
  }

  function startPage() {
    page = [];
    pages.push(page);
    if (logo) drawLogo(logo);
    if (banner) drawBanner(banner);
    top = PAGE_HEIGHT - MARGIN_TOP;
    drawRow(header);
  }

  function place(cells: PdfCell[]) {
    if (top - rowHeight(cells) < MARGIN_BOTTOM) startPage();
    drawRow(cells);
  }

  startPage();
  for (const row of rows) place(row);
  place(footer);

  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = `Página ${i + 1}/${pages.length}`;
      p.push(textOps(label, right - textWidth(label, FONT_SIZE), MARGIN_BOTTOM - 16, FONT_SIZE, ink, "medium"));
    });
  }

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add("");
  const tree = add("");
  const object = (dict: string, body: Buffer) =>
    `<< ${dict} /Length ${body.length} >>\nstream\n${body.toString("latin1")}\nendstream`;

  function embed(font: PdfFont, glyphs: Map<number, number>, tag: string) {
    const name = `${tag}+${font.name}`;
    const file = add(object(`/Length1 ${font.raw.length} /Filter /FlateDecode`, font.compressed));
    const [x0, y0, x1, y1] = font.bbox.map((v) => Math.round((v * 1000) / font.units));
    const scale = (v: number) => Math.round((v * 1000) / font.units);
    const descriptor = add(
      `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${x0} ${y0} ${x1} ${y1}] /ItalicAngle 0 /Ascent ${scale(font.ascent)} /Descent ${scale(font.descent)} /CapHeight 700 /StemV 80 /FontFile2 ${file} 0 R >>`
    );
    const ids = [...glyphs.keys()].sort((a, b) => a - b);
    const widths = ids.map((id) => `${id} [${font.advance(id)}]`).join(" ");
    const cid = add(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /DW 600 /W [${widths}] >>`
    );
    const pairs = ids.map((id) => `<${id.toString(16).padStart(4, "0")}> <${glyphs.get(id)!.toString(16).padStart(4, "0")}>`);
    const blocks: string[] = [];
    for (let i = 0; i < pairs.length; i += 100) {
      const part = pairs.slice(i, i + 100);
      blocks.push(`${part.length} beginbfchar\n${part.join("\n")}\nendbfchar`);
    }
    const map = [
      "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
      "/CMapName /Adobe-Identity-UCS def /CMapType 2 def",
      "1 begincodespacerange <0000> <FFFF> endcodespacerange",
      ...blocks,
      "endcmap CMapName currentdict /CMap defineresource pop end end"
    ].join("\n");
    const unicode = add(object("", Buffer.from(map, "latin1")));
    return add(
      `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`
    );
  }

  const regular = embed(MEDIUM, used.medium, "AAJKMD");
  const bold = embed(BOLD, used.bold, "AAJKBD");
  const images: string[] = [];
  if (logo) {
    const png = decodePng(logo.png);
    const size = `/Width ${png.width} /Height ${png.height} /BitsPerComponent 8 /Filter /FlateDecode`;
    const mask = png.alpha
      ? add(object(`/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceGray`, deflateSync(png.alpha)))
      : undefined;
    const soft = mask ? ` /SMask ${mask} 0 R` : "";
    const image = add(object(`/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceRGB${soft}`, deflateSync(png.rgb)));
    images.push(`/XObject << /Im1 ${image} 0 R >>`);
  }
  const kids = pages.map((p) => {
    const content = add(object("/Filter /FlateDecode", deflateSync(Buffer.from(p.join("\n"), "latin1"))));
    return add(
      `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${content} 0 R /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> ${images.join(" ")} >> >>`
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const positions = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
