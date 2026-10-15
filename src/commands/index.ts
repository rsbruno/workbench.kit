import type { Command } from "../lib/command";

import { timesheetCommands } from "./timesheet";
import { projectsCommands } from "./projects";
import { commitsCommands } from "./commits";
import { dailyCommands } from "./daily";
import { timeCommands } from "./time";

export const groups: Record<string, Command[]> = {
  timesheet: timesheetCommands,
  projects: projectsCommands,
  commits: commitsCommands,
  daily: dailyCommands,
  time: timeCommands
};
