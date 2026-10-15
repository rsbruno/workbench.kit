import type { Command } from "../lib/command";

import { timesheetCommands } from "./timesheet";

export const groups: Record<string, Command[]> = {
  timesheet: timesheetCommands
};
