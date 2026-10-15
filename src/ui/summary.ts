import { note, log } from "@clack/prompts";

import { alignRows, type Row } from "./format";

export function summary(title: string, rows: Row[]) {
  note(alignRows(rows).join("\n"), title);
}

export const info = (message: string) => log.info(message);
export const warn = (message: string) => log.warn(message);
