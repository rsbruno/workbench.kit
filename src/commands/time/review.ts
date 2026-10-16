import { spinner, note } from "@clack/prompts";

import type { Agent } from "../../lib/config";
import type { Daily } from "../../db/schema";

import { validateBlocks, removeBlockAt, replaceBlock, appendBlock, type Block, totalsOf } from "../../lib/repo/estimate";
import { formatDuration, formatClock, TimeKind } from "../../lib/repo/clock";
import { type Proposal, estimateOne } from "./estimate";
import { info, warn } from "../../ui/summary";
import { askClock, askKind } from "./shared";
import { brDay } from "../../lib/repo/dates";
import { selectOne } from "../../ui/prompt";
import { bold, dim } from "../../ui/color";

export type Entry = Proposal & { daily: Daily; skipped: boolean };

const SOURCE: Record<Proposal["source"], string> = { fallback: "reserva", edited: "editado", agent: "agente" };

const rangeOf = (block: Block) =>
  `${formatClock(block.startMinute)}–${formatClock(block.endMinute)}${block.kind === TimeKind.OVERTIME ? " extra" : ""}`;

/** What would be saved for the day (a skipped day, or one with no blocks, saves nothing). */
export const willSave = (entry: Entry) => !entry.skipped && entry.blocks.length > 0;

function totalLabel(blocks: Block[]) {
  const { regular, extra } = totalsOf(blocks);
  return `${formatDuration(regular + extra)}${extra ? ` (${formatDuration(extra)} extra)` : ""}`;
}

function describe(entry: Entry): string {
  if (entry.skipped) return "pulado";
  if (!entry.blocks.length) return "sem blocos (nada será gravado)";
  return `${entry.blocks.map(rangeOf).join(" · ")} · ${totalLabel(entry.blocks)} · ${SOURCE[entry.source]}`;
}

export function totalsOfEntries(entries: Entry[]) {
  return entries.filter(willSave).reduce(
    (sum, { blocks }) => {
      const { regular, extra } = totalsOf(blocks);
      return { regular: sum.regular + regular, extra: sum.extra + extra, days: sum.days + 1 };
    },
    { regular: 0, extra: 0, days: 0 }
  );
}

async function askBlock(current?: Block): Promise<Block> {
  const startMinute = await askClock("Hora de início (HH:MM)", current?.startMinute);
  const endMinute = await askClock("Hora de fim (HH:MM)", current?.endMinute, startMinute);
  const kind = await askKind(current?.kind);
  return { startMinute, endMinute, kind };
}

/** Applies an edit only when the day's blocks stay valid. */
function change(entry: Entry, blocks: Block[]) {
  const error = validateBlocks(blocks);
  if (error) return warn(`${error}; nada foi alterado`);
  entry.blocks = blocks;
  entry.source = "edited";
}

async function again(agent: Agent, entry: Entry) {
  const progress = spinner();
  progress.start(`Pedindo de novo ao ${agent} · ${brDay(entry.date)}`);
  try {
    const next = await estimateOne(agent, entry);
    Object.assign(entry, next, { skipped: false });
    progress.stop("Nova estimativa recebida");
  } catch (error) {
    progress.error((error as Error).message);
  }
}

async function editDay(agent: Agent, entry: Entry) {
  for (;;) {
    const { commits, anchors } = entry;
    const first = commits[0]!.authoredAt.slice(11, 16);
    const last = commits.at(-1)!.authoredAt.slice(11, 16);
    note(
      [
        `${bold(brDay(entry.date))}  ${dim(`${commits.length} commits · de ${first} a ${last} · âncoras ${anchors.first}h–${anchors.last}h`)}`,
        ...(entry.blocks.length ? entry.blocks.map((b) => `  ${rangeOf(b)}`) : ["  (sem blocos)"]),
        `  ${dim(`${SOURCE[entry.source]}: ${entry.reason}`)}`
      ].join("\n"),
      entry.skipped ? "dia pulado" : "horas do dia"
    );

    const changed = JSON.stringify(entry.blocks) !== JSON.stringify(entry.original.blocks);
    const action = await selectOne<string>("O que fazer neste dia?", [
      ...entry.blocks.map((b, i) => ({ name: `Editar ${rangeOf(b)}`, value: `edit:${i}` })),
      { name: "Adicionar bloco", value: "add" },
      ...(entry.blocks.length ? [{ name: "Remover bloco…", value: "remove" }] : []),
      { detail: `${agent} estima só este dia`, name: "Pedir de novo ao agente", value: "again" },
      ...(changed ? [{ name: "Voltar à proposta original", value: "restore" }] : []),
      { name: entry.skipped ? "Reativar este dia" : "Pular este dia", value: "skip" },
      { name: "Voltar à lista", value: "back" }
    ]);

    if (action === "back") return;
    if (action === "add") change(entry, appendBlock(entry.blocks, await askBlock()));
    else if (action === "skip") entry.skipped = !entry.skipped;
    else if (action === "again") await again(agent, entry);
    else if (action === "restore") {
      entry.blocks = entry.original.blocks;
      entry.reason = entry.original.reason;
      entry.source = entry.original.source;
    } else if (action === "remove") {
      const which = await selectOne(
        "Qual bloco remover?",
        entry.blocks.map((b, i) => ({ name: rangeOf(b), value: i }))
      );
      change(entry, removeBlockAt(entry.blocks, which));
    } else if (action.startsWith("edit:")) {
      const index = Number(action.slice(5));
      change(entry, replaceBlock(entry.blocks, index, await askBlock(entry.blocks[index])));
    }
  }
}

/**
 * The review screen: every day is listed with its proposed hours and can be opened to edit freely
 * (any HH:MM, add, remove, ask the agent again, restore, skip). Returns the entries, or undefined if
 * the user cancels.
 */
export async function review(agent: Agent, entries: Entry[]): Promise<Entry[] | undefined> {
  for (;;) {
    const { regular, extra, days } = totalsOfEntries(entries);
    const choice = await selectOne<string>("Revisar as horas", [
      {
        detail: `${formatDuration(regular + extra)}${extra ? ` (${formatDuration(extra)} extra)` : ""}`,
        name: `Gravar ${days} ${days === 1 ? "dia" : "dias"}`,
        value: "save"
      },
      { name: "Cancelar", value: "cancel" },
      ...entries.map((entry, i) => ({ detail: describe(entry), name: brDay(entry.date), value: `day:${i}` }))
    ]);

    if (choice === "cancel") return undefined;
    if (choice === "save") {
      if (days) return entries;
      info("não há nenhum dia para gravar; abra um dia para ajustar ou cancele");
      continue;
    }
    await editDay(agent, entries[Number(choice.slice(4))]!);
  }
}
