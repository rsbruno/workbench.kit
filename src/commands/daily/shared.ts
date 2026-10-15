import type { Project, Daily } from "../../db/schema";
import type { Flags } from "../../lib/command";
import type { Db } from "../../db";

import { parsePtBrDate, startOfDay, dateError, brDay } from "../../lib/repo/dates";
import { type Option, selectOne, askText } from "../../ui/prompt";
import { pickProject } from "../projects/shared";
import { findProject } from "../../db/projects";
import { listDailies } from "../../db/dailies";

export const br = brDay;

const today = () => {
  const d = new Date();
  return [String(d.getDate()).padStart(2, "0"), String(d.getMonth() + 1).padStart(2, "0"), d.getFullYear()].join("/");
};

const requiredDate = (v: string) => (v ? dateError(v) : "a data é obrigatória");

export const dailyRows = (e: Daily, project: Project) => [
  { detail: project.name, name: "projeto" },
  { detail: br(e.day), name: "data" },
  { detail: e.content, name: "texto" },
  { detail: e.id, name: "id" },
  { detail: e.createdAt, name: "criado em" },
  { name: "atualizado em", detail: e.updatedAt }
];

function toDay(value: string): Date {
  const iso = parsePtBrDate(value);
  if (!iso) throw new Error(dateError(value) ?? "data inválida");
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

const RECENT_DAYS = 14;
const OTHER = "other";

function recentOptions(taken: Set<number>) {
  const options: Option<Date | typeof OTHER>[] = [];
  for (let back = 0; back < RECENT_DAYS; back++) {
    const date = startOfDay(new Date());
    date.setDate(date.getDate() - back);
    const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
    const label = back === 0 ? "hoje" : back === 1 ? "ontem" : weekday;
    const detail = taken.has(date.getTime()) ? `${label} · já reportado` : label;
    options.push({ name: br(date), value: date, detail });
  }
  options.push({ detail: "digitar outra data", name: "outra data", value: OTHER });
  return options;
}

export async function resolveDay(arg: string | undefined, taken: Set<number> = new Set()): Promise<Date> {
  if (arg) return toDay(arg);
  const picked = await selectOne("Data do apontamento", recentOptions(taken));
  if (picked instanceof Date) return picked;
  return toDay(await askText("Data do apontamento (DD/MM/AAAA)", { validate: requiredDate, initial: today() }));
}

export async function resolveContent(flags: Flags, initial?: string): Promise<string> {
  if (flags.text?.trim()) return flags.text.trim();
  return askText("Texto do apontamento", {
    validate: (v) => (v ? undefined : "o texto do apontamento é obrigatório"),
    initial
  });
}

export async function pickDaily(db: Db, project: Project, arg: string | undefined, message: string): Promise<Daily> {
  const all = await listDailies(db, project.id);
  if (arg) {
    const day = toDay(arg);
    const found = all.find((e) => e.day.getTime() === day.getTime());
    if (!found) throw new Error(`nenhum apontamento em ${br(day)} no projeto "${project.name}"`);
    return found;
  }
  if (!all.length) throw new Error(`nenhum apontamento no projeto "${project.name}"`);
  const id = await selectOne(
    message,
    all.map((e) => ({ detail: e.content.split("\n")[0]!.slice(0, 60), name: br(e.day), value: e.id }))
  );
  return all.find((e) => e.id === id)!;
}

export async function resolveProject(db: Db, flags: Flags): Promise<Project> {
  if (flags.project?.trim()) return findProject(db, flags.project);
  return pickProject(db, undefined, "Em qual projeto você trabalhou?");
}
