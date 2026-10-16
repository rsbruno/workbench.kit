import type { Flags } from "../lib/command";

import { capitalize, MONTHS } from "./timesheet/style";
import { selectOne, askText } from "../ui/prompt";
import { parseMonth } from "./timesheet/data";

const MONTH_CHOICES = 12;
const OTHER = "other";

export type Month = { month: number; year: number };

const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const dateOf = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
};
export const label = ({ month, year }: Month) => `${capitalize(MONTHS[month]!)}/${year}`;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function chooseMonth(flags: Flags): Promise<Month> {
  if (flags.month?.trim()) return parseMonth(flags.month);

  const now = new Date();
  const recent = Array.from({ length: MONTH_CHOICES }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const picked = await selectOne("Mês de referência", [
    ...recent.map((m) => ({
      detail: m.year === now.getFullYear() && m.month === now.getMonth() ? "mês atual" : undefined,
      value: `${pad(m.month + 1)}/${m.year}`,
      name: label(m)
    })),
    { name: "Outro mês…", value: OTHER }
  ]);
  if (picked !== OTHER) return parseMonth(picked);
  return parseMonth(
    await askText("Mês de referência (MM/AAAA)", {
      validate: (v) => {
        try {
          parseMonth(v || undefined);
          return v ? undefined : "informe o mês";
        } catch (e) {
          return (e as Error).message;
        }
      }
    })
  );
}
