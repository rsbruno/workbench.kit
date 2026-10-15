import type { TimeEntry, Project, Daily } from "../../db/schema";
import type { Flags } from "../../lib/command";
import type { Db } from "../../db";

import { formatDuration, formatClock, KIND_LABEL, parseClock, clockError, parseKind, TimeKind } from "../../lib/repo/clock";
import { resolveProject, pickDaily, br } from "../daily/shared";
import { selectOne, askText } from "../../ui/prompt";
import { listTimes } from "../../db/times";

export const rangeOf = (t: TimeEntry) => `${formatClock(t.startMinute)}–${formatClock(t.endMinute)}`;

export const timeRows = (t: TimeEntry, daily: Daily, project: Project) => [
  { detail: project.name, name: "projeto" },
  { detail: br(daily.day), name: "daily" },
  { detail: `${rangeOf(t)} (${formatDuration(t.endMinute - t.startMinute)})`, name: "horário" },
  { detail: KIND_LABEL[t.kind], name: "tipo" },
  { detail: t.description || "(vazio)", name: "descrição" },
  { detail: t.id, name: "id" },
  { detail: t.createdAt, name: "criado em" },
  { name: "atualizado em", detail: t.updatedAt }
];

export async function resolveDaily(db: Db, flags: Flags, dateArg: string | undefined, message: string) {
  const project = await resolveProject(db, flags);
  const daily = await pickDaily(db, project, dateArg, message);
  return { project, daily };
}

export function flagClock(name: string, value: string): number {
  const minutes = parseClock(value);
  if (minutes === null) throw new Error(`--${name}: ${clockError(value)}`);
  return minutes;
}

export function flagKind(value: string): TimeKind {
  const kind = parseKind(value);
  if (!kind) throw new Error('--type: use "comum" ou "extra"');
  return kind;
}

export async function askClock(label: string, initial?: number, after?: number): Promise<number> {
  const answer = await askText(label, {
    validate: (v) => {
      if (!v) return "a hora é obrigatória";
      const error = clockError(v);
      if (error || after === undefined) return error;
      return parseClock(v)! > after ? undefined : "a hora de fim deve ser depois da hora de início";
    },
    initial: initial === undefined ? undefined : formatClock(initial)
  });
  return parseClock(answer)!;
}

export function askKind(current?: TimeKind): Promise<TimeKind> {
  const options = [
    { name: KIND_LABEL[TimeKind.REGULAR], value: TimeKind.REGULAR },
    { name: KIND_LABEL[TimeKind.OVERTIME], value: TimeKind.OVERTIME }
  ];
  if (current === TimeKind.OVERTIME) options.reverse();
  return selectOne("Tipo de hora", options);
}

export async function pickTime(db: Db, daily: Daily, message: string): Promise<TimeEntry> {
  const all = await listTimes(db, [daily.id]);
  if (!all.length) throw new Error(`nenhum lançamento de hora na daily de ${br(daily.day)}`);
  if (all.length === 1) return all[0]!;
  const id = await selectOne(
    message,
    all.map((t) => ({
      detail: `${KIND_LABEL[t.kind]}${t.description ? ` · ${t.description}` : ""}`,
      name: rangeOf(t),
      value: t.id
    }))
  );
  return all.find((t) => t.id === id)!;
}
