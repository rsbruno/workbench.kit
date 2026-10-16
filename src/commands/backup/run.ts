import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { uploadBackup, accessToken } from "../../lib/drive";
import { dumpDatabase, backupName } from "../../lib/backup";
import { markBackup } from "../../lib/backup-reminder";
import { defineCommand } from "../../lib/command";
import { requireDrive } from "../../lib/config";
import { formatBytes } from "../../lib/bytes";
import { backupsDir } from "../../lib/paths";
import { summary } from "../../ui/summary";
import { task } from "../../ui/task";

export const run = defineCommand({
  run: async (_args, flags) => {
    const drive = flags.local ? undefined : requireDrive();
    const name = backupName();
    const dump = await task("exporting the database", "database exported", dumpDatabase);

    if (!drive) {
      const dir = backupsDir();
      mkdirSync(dir, { recursive: true });
      const file = join(dir, name);
      writeFileSync(file, dump);
      markBackup();
      return summary("backup", [
        { detail: formatBytes(dump.length), name: "tamanho" },
        { name: "arquivo", detail: file }
      ]);
    }

    const uploaded = await task("sending to Google Drive", "sent to Google Drive", async () =>
      uploadBackup(await accessToken(drive), name, dump)
    );
    markBackup();
    if (flags.json) return void process.stdout.write(`${JSON.stringify(uploaded, null, 2)}\n`);
    summary("backup", [
      { detail: formatBytes(dump.length), name: "tamanho" },
      { detail: uploaded.name, name: "arquivo" },
      { detail: uploaded.id, name: "id" }
    ]);
  },
  description: "export the database and send it to Google Drive (--local saves a file instead)",
  name: "run"
});
