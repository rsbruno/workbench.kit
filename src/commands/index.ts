import type { Command } from "../lib/command";

import { projectsCommands } from "./projects";
import { commitsCommands } from "./commits";

export const groups: Record<string, Command[]> = {
  projects: projectsCommands,
  commits: commitsCommands
};
