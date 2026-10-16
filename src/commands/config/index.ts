import type { Command } from "../../lib/command";

import { agent } from "./agent";
import { drive } from "./drive";
import { menu } from "./menu";
import { show } from "./show";

export const configCommands: Command[] = [menu, agent, drive, show];
