import { crc32 } from "node:zlib";

export type Style = {
  align?: "center" | "right" | "left";
  valign?: "center" | "top";
  numFmt?: string;
  border?: string;
  color?: string;
  bold?: boolean;
  wrap?: boolean;
  fill?: string;
  size?: number;
};

export type Cell = { value?: string | number; formula?: string; style?: Style; col: string };

export type Row = { cells: Cell[]; height?: number };

export type Logo = { height: number; width: number; png: Buffer; radius: number };

export type Sheet = {
  merges?: string[];
  widths: number[];
  font: string;
  name: string;
  logo?: Logo;
  rows: Row[];
};

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DML = "http://schemas.openxmlformats.org/drawingml/2006/main";
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const EMU_PER_PIXEL = 9525;
const CUSTOM_FORMATS_FROM = 164;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Collects the distinct fonts, fills, borders and formats used by the cells into styles.xml. */
class StyleBook {
  private readonly fonts: string[] = [];
  private readonly fills: string[] = [];
  private readonly borders: string[] = [];
  private readonly formats = new Map<string, number>();
  private readonly xfs: string[] = [];
  private readonly known = new Map<string, number>();

  constructor(private readonly family: string) {
    this.font({});
    this.fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.border(undefined);
    this.id({});
  }

  private intern(list: string[], xml: string) {
    const at = list.indexOf(xml);
    if (at >= 0) return at;
    list.push(xml);
    return list.length - 1;
  }

  private font({ color, bold, size }: Style) {
    const xml = `<font>${bold ? "<b/>" : ""}<sz val="${size ?? 9}"/><color rgb="${argb(color ?? "#000000")}"/><name val="${escape(this.family)}"/></font>`;
    return this.intern(this.fonts, xml);
  }

  private fill(hex: string | undefined) {
    if (!hex) return 0;
    return this.intern(
      this.fills,
      `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`
    );
  }

  private border(hex: string | undefined) {
    const side = (name: string) => (hex ? `<${name} style="thin"><color rgb="${argb(hex)}"/></${name}>` : `<${name}/>`);
    return this.intern(
      this.borders,
      `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`
    );
  }

  private format(code: string | undefined) {
    if (!code) return 0;
    if (!this.formats.has(code)) this.formats.set(code, CUSTOM_FORMATS_FROM + this.formats.size);
    return this.formats.get(code)!;
  }

  id(style: Style): number {
    const key = JSON.stringify(style);
    const known = this.known.get(key);
    if (known !== undefined) return known;
    const alignment = `<alignment horizontal="${style.align ?? "general"}" vertical="${style.valign ?? "center"}"${style.wrap ? ' wrapText="1"' : ""}/>`;
    const xf = `<xf numFmtId="${this.format(style.numFmt)}" fontId="${this.font(style)}" fillId="${this.fill(style.fill)}" borderId="${this.border(style.border)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`;
    this.xfs.push(xf);
    this.known.set(key, this.xfs.length - 1);
    return this.xfs.length - 1;
  }

  xml(): string {
    const formats = [...this.formats].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escape(code)}"/>`).join("");
    const list = (tag: string, items: string[]) => `<${tag} count="${items.length}">${items.join("")}</${tag}>`;
    return (
      `${HEADER}<styleSheet xmlns="${NS}">` +
      (formats ? `<numFmts count="${this.formats.size}">${formats}</numFmts>` : "") +
      list("fonts", this.fonts) +
      list("fills", this.fills) +
      list("borders", this.borders) +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      list("cellXfs", this.xfs) +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    );
  }
}

function cellXml(row: number, cell: Cell, book: StyleBook): string {
  const ref = `${cell.col}${row}`;
  const style = ` s="${book.id(cell.style ?? {})}"`;
  if (cell.formula !== undefined) {
    const cached = cell.value === undefined ? "" : `<v>${cell.value}</v>`;
    return `<c r="${ref}"${style}><f>${escape(cell.formula)}</f>${cached}</c>`;
  }
  if (typeof cell.value === "number") return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  if (cell.value === undefined) return `<c r="${ref}"${style}/>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(cell.value)}</t></is></c>`;
}

function sheetXml({ merges, widths, logo, rows }: Sheet, book: StyleBook): string {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const body = rows
    .map(({ height, cells }, i) => {
      const sorted = [...cells].sort((a, b) => colIndex(a.col) - colIndex(b.col));
      const size = height ? ` ht="${height}" customHeight="1"` : "";
      return `<row r="${i + 1}"${size}>${sorted.map((c) => cellXml(i + 1, c, book)).join("")}</row>`;
    })
    .join("");
  const merged = merges?.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `${HEADER}<worksheet xmlns="${NS}" xmlns:r="${REL}">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${body}</sheetData>${merged}` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    (logo ? `<drawing r:id="rId1"/>` : "") +
    `</worksheet>`
  );
}

function drawingXml({ height, radius, width }: Logo): string {
  const [cx, cy] = [width * EMU_PER_PIXEL, height * EMU_PER_PIXEL];
  return (
    `${HEADER}<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${DML}"><xdr:oneCellAnchor>` +
    `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>${4 * EMU_PER_PIXEL}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${4 * EMU_PER_PIXEL}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${radius}"/></a:avLst></a:prstGeom></xdr:spPr>` +
    `</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
  );
}

type Entry = { name: string; data: string | Buffer };

function zip(files: Entry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((total, b) => total + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

export function buildXlsx(sheet: Sheet): Buffer {
  const book = new StyleBook(sheet.font);
  const sheetContent = sheetXml(sheet, book);
  const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`;
  const types = (extra: string) =>
    `${HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${extra}</Types>`;

  const files: Entry[] = [
    {
      data: types(
        sheet.logo
          ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
          : ""
      ),
      name: "[Content_Types].xml"
    },
    {
      data: `${HEADER}<Relationships xmlns="${PKG}">${rel("rId1", "officeDocument", "xl/workbook.xml")}</Relationships>`,
      name: "_rels/.rels"
    },
    {
      data: `${HEADER}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${escape(sheet.name)}" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`,
      name: "xl/workbook.xml"
    },
    {
      data: `${HEADER}<Relationships xmlns="${PKG}">${rel("rId1", "worksheet", "worksheets/sheet1.xml")}${rel("rId2", "styles", "styles.xml")}</Relationships>`,
      name: "xl/_rels/workbook.xml.rels"
    },
    { name: "xl/styles.xml", data: book.xml() },
    { name: "xl/worksheets/sheet1.xml", data: sheetContent }
  ];
  if (sheet.logo) {
    files.push(
      {
        data: `${HEADER}<Relationships xmlns="${PKG}">${rel("rId1", "drawing", "../drawings/drawing1.xml")}</Relationships>`,
        name: "xl/worksheets/_rels/sheet1.xml.rels"
      },
      { name: "xl/drawings/drawing1.xml", data: drawingXml(sheet.logo) },
      {
        data: `${HEADER}<Relationships xmlns="${PKG}">${rel("rId1", "image", "../media/image1.png")}</Relationships>`,
        name: "xl/drawings/_rels/drawing1.xml.rels"
      },
      { name: "xl/media/image1.png", data: sheet.logo.png }
    );
  }
  return zip(files);
}
