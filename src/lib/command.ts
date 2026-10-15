export type Flags = {
  remote?: string;
  folder?: string;
  since?: string;
  until?: string;
  project?: string;
  force?: boolean;
  path?: string;
  json?: boolean;
  start?: string;
  type?: string;
  end?: string;
  text?: string;
  month?: string;
  out?: string;
};

export type Command = {
  run: (args: string[], flags: Flags) => Promise<void>;
  description: string;
  aliases?: string[];
  name: string;
};

export const defineCommand = (command: Command) => command;

export function findCommand(commands: Command[], name: string) {
  return commands.find((c) => c.name === name || c.aliases?.includes(name));
}
