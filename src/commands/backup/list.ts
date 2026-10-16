import { accessToken, listBackups } from "../../lib/drive";
import { defineCommand } from "../../lib/command";
import { summary, info } from "../../ui/summary";
import { requireDrive } from "../../lib/config";
import { formatBytes } from "../../lib/bytes";
import { task } from "../../ui/task";

export const list = defineCommand({
  run: async (_args, flags) => {
    const drive = requireDrive();
    const files = await task("listing backups", "backups listed", async () => listBackups(await accessToken(drive)));
    if (flags.json) return void process.stdout.write(`${JSON.stringify(files, null, 2)}\n`);
    if (!files.length) return info("no backups in Drive; run workbench backup run");
    summary(
      "backups",
      files.map((f) => ({
        detail: `${new Date(f.createdTime).toLocaleString("en-GB")}  ${formatBytes(f.size)}  ${f.id}`,
        name: f.name
      }))
    );
  },
  description: "list the backups stored in Google Drive (--json for raw output)",
  name: "list"
});
