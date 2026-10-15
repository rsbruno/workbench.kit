import type { Command } from "../lib/command";

import { projectsCommands } from "./projects";
import { commitsCommands } from "./commits";
import { dailyCommands } from "./daily";
import { timeCommands } from "./time";

export const groups: Record<string, Command[]> = {
  projects: projectsCommands,
  commits: commitsCommands,
  daily: dailyCommands,
  time: timeCommands
};
