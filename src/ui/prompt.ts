import { MultiSelectPrompt, SelectPrompt, isCancel } from "@clack/core";
import { confirm, cancel, text } from "@clack/prompts";

export type Option<T> = { value: T; name: string; detail?: string };

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;

let stepTotal = 0;
let stepCurrent = 0;

export function startSteps(total: number) {
  stepTotal = total;
  stepCurrent = 0;
}

function title(message: string) {
  stepCurrent++;
  return stepTotal ? `${message}  ${dim(`${stepCurrent}/${stepTotal}`)}` : message;
}

const MAX_SHOWN = 4;
const summarize = (names: string[]) =>
  names.length <= MAX_SHOWN ? names.join(", ") : `${names.slice(0, MAX_SHOWN).join(", ")} ${dim(`+${names.length - MAX_SHOWN}`)}`;

const bar = (line: string) => `${dim("│")}  ${line}`;

function guard<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("cancelled");
    process.exit(130);
  }
  return value as T;
}

function requireTty() {
  if (!process.stdin.isTTY) throw new Error("interactive prompt needs a TTY; pass the flags instead");
}

function renderRow<T>(options: Option<T>[], i: number, width: number, mark: string, active: boolean) {
  const o = options[i]!;
  const name = o.name.padEnd(width);
  const line = `${mark} ${active ? cyan(name) : name}${o.detail ? `   ${dim(o.detail)}` : ""}`;
  return `${active ? cyan("❯") : " "} ${line}`;
}

const widthOf = <T>(options: Option<T>[]) => Math.max(0, ...options.map((o) => o.name.length));

export async function selectOne<T>(message: string, options: Option<T>[]): Promise<T> {
  requireTty();
  const width = widthOf(options);
  const label = title(message);
  const prompt = new SelectPrompt<{ value: T }>({
    render() {
      if (this.state === "cancel") return "";
      if (this.state === "submit") return [`${green("◇")}  ${label}`, bar(options[this.cursor]!.name), dim("│")].join("\n");
      const rows = options.map((_, i) => bar(renderRow(options, i, width, i === this.cursor ? "●" : "○", i === this.cursor)));
      return [`${cyan("◆")}  ${label}`, ...rows, dim("│")].join("\n");
    },
    options: options.map((o) => ({ value: o.value }))
  });
  return guard<T>((await prompt.prompt()) as T | symbol);
}

export async function selectMany<T>(message: string, options: Option<T>[]): Promise<T[]> {
  requireTty();
  const width = widthOf(options);
  const label = title(message);
  const prompt = new MultiSelectPrompt<{ value: T }>({
    render() {
      if (this.state === "cancel") return "";
      if (this.state === "submit") {
        const picked = options.filter((o) => this.value?.includes(o.value)).map((o) => o.name);
        return [`${green("◇")}  ${label}`, bar(summarize(picked)), dim("│")].join("\n");
      }
      const rows = options.map((o, i) => {
        const checked = this.value?.includes(o.value);
        return bar(renderRow(options, i, width, checked ? cyan("◼") : "◻", i === this.cursor));
      });
      const hint = bar(dim("space toggle · a all · i invert · enter confirm"));
      const err = this.state === "error" ? [bar(red(String(this.error)))] : [];
      return [`${cyan("◆")}  ${label}`, hint, ...rows, ...err, dim("│")].join("\n");
    },
    validate: (value) => (value?.length ? undefined : "select at least one"),
    options: options.map((o) => ({ value: o.value }))
  });
  return guard<T[]>((await prompt.prompt()) as T[] | symbol);
}

type TextOptions = { validate?: (value: string) => string | undefined; placeholder?: string; initial?: string };

export async function askText(message: string, { placeholder, validate, initial }: TextOptions = {}): Promise<string> {
  requireTty();
  const answer = guard<string>(
    await text({ validate: (v) => validate?.((v ?? "").trim()), initialValue: initial, placeholder, message })
  );
  return answer.trim();
}

export async function askConfirm(message: string, initial = false): Promise<boolean> {
  requireTty();
  return guard<boolean>(await confirm({ initialValue: initial, message }));
}

export function planSteps(...asked: boolean[]) {
  startSteps(asked.filter(Boolean).length);
}
