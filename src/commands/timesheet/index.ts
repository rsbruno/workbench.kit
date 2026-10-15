import type { Command } from "../../lib/command";

import { explore } from "./explore";
import { config } from "./config";

export const timesheetCommands: Command[] = [explore, config];
