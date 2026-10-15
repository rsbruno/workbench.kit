import type { Command } from "../../lib/command";

import { xlsx } from "./xlsx";
import { list } from "./list";
import { csv } from "./csv";
import { pdf } from "./pdf";

export const timesheetCommands: Command[] = [list, pdf, xlsx, csv];
