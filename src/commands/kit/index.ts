import type { Command } from "../../lib/command";

import { migrate } from "./migrate";
import { update } from "./update";

export const kitCommands: Command[] = [update, migrate];
