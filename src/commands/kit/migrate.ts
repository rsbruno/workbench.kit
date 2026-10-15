import { defineCommand } from "../../lib/command";
import { info } from "../../ui/summary";
import { withDb } from "../../db";

export const migrate = defineCommand({
  run: async () => {
    await withDb(async () => undefined);
    info("database is up to date");
  },
  description: "apply pending database migrations",
  name: "migrate"
});
