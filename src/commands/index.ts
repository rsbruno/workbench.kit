import type { Command } from "../lib/command";

import { timesheetCommands } from "./timesheet";
import { projectsCommands } from "./projects";
import { commitsCommands } from "./commits";
import { dailyCommands } from "./daily";
import { timeCommands } from "./time";
import { update } from "./kit/update";
import { kitCommands } from "./kit";

export const topLevel: Command[] = [update];

export const groups: Record<string, Command[]> = {
  timesheet: timesheetCommands,
  projects: projectsCommands,
  commits: commitsCommands,
  daily: dailyCommands,
  time: timeCommands,
  kit: kitCommands
};
