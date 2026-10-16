import type { Command } from "../../lib/command";

import { remove } from "./remove";
import { update } from "./update";
import { sync } from "./sync";
import { list } from "./list";
import { add } from "./add";

export const dailyCommands: Command[] = [add, list, sync, update, remove];
