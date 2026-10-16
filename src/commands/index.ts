import type { Command } from "../lib/command";

import { timesheetCommands } from "./timesheet";
import { projectsCommands } from "./projects";
import { commitsCommands } from "./commits";
import { backupCommands } from "./backup";
import { configCommands } from "./config";
import { dailyCommands } from "./daily";
import { timeCommands } from "./time";
import { update } from "./kit/update";
import { kitCommands } from "./kit";

export const topLevel: Command[] = [update];

export const groups: Record<string, Command[]> = {
  timesheet: timesheetCommands,
  projects: projectsCommands,
  commits: commitsCommands,
  backup: backupCommands,
  config: configCommands,
  daily: dailyCommands,
  time: timeCommands,
  kit: kitCommands
};

/** The action a group runs when none is given (needs a terminal). */
export const defaults: Record<string, string> = { config: "menu", backup: "run" };
