import type { Command } from "../../lib/command";

import { restore } from "./restore";
import { list } from "./list";
import { run } from "./run";

export const backupCommands: Command[] = [run, restore, list];
