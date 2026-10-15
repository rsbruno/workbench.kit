export type Flags = { since?: string; until?: string; json?: boolean };

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
