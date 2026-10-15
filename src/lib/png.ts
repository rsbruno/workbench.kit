import { inflateSync } from "node:zlib";

export type Png = { alpha?: Buffer; height: number; rgb: Buffer; width: number };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 2: 3, 6: 4 };

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes 8-bit, non-interlaced RGB/RGBA PNGs (what the logo uses). */
export function decodePng(file: Buffer): Png {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const [depth, type, , , interlace] = [file[24]!, file[25]!, file[26], file[27], file[28]];
  const channels = CHANNELS[type];
  if (depth !== 8 || !channels || interlace) throw new Error("unsupported PNG: use 8-bit RGB/RGBA, not interlaced");

  const data: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    if (file.toString("latin1", at + 4, at + 8) === "IDAT") data.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const base = raw[from + x]!;
      const add = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
      pixels[y * stride + x] = (base + add) & 0xff;
    }
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = pixels[i * channels + c]!;
    alpha[i] = channels === 4 ? pixels[i * 4 + 3]! : 255;
  }
  return { alpha: alpha.some((a) => a !== 255) ? alpha : undefined, height, width, rgb };
}
