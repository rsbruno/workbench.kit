import type { Command } from "../../lib/command";

import { remove } from "./remove";
import { update } from "./update";
import { list } from "./list";
import { add } from "./add";

export const projectsCommands: Command[] = [add, list, update, remove];
