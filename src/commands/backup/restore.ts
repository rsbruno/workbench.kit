import { readFileSync } from "node:fs";

import { downloadBackup, listBackups, accessToken } from "../../lib/drive";
import { askConfirm, selectOne } from "../../ui/prompt";
import { restoreDatabase } from "../../lib/backup";
import { defineCommand } from "../../lib/command";
import { requireDrive } from "../../lib/config";
import { formatBytes } from "../../lib/bytes";
import { summary } from "../../ui/summary";
import { task } from "../../ui/task";

export const restore = defineCommand({
  run: async (args, flags) => {
    const given = flags.file ?? args[0];
    let content: Buffer;
    let label: string;

    if (given && readable(given)) {
      content = readFileSync(given);
      label = given;
    } else {
      const drive = requireDrive();
      const token = await accessToken(drive);
      let id = given;
      if (!id) {
        const files = await task("listing backups", "backups listed", () => listBackups(token));
        if (!files.length) throw new Error("no backups in Drive; run workbench backup run");
        id = await selectOne(
          "Which backup do you want to restore?",
          files.map((f) => ({
            detail: `${new Date(f.createdTime).toLocaleString("en-GB")}  ${formatBytes(f.size)}`,
            name: f.name,
            value: f.id
          }))
        );
      }
      content = await task("downloading the backup", "backup downloaded", () => downloadBackup(token, id));
      label = id;
    }

    if (
      !flags.yes &&
      !(await askConfirm("This replaces the current database with the backup, with no copy of what exists today. Continue?"))
    ) {
      throw new Error("restore cancelled");
    }
    const { target } = await task("restoring the database", "database restored", () => restoreDatabase(content));
    summary("restore", [
      { name: "source", detail: label },
      { name: "database", detail: target }
    ]);
  },
  description:
    "restore the database from a backup: restore [id|path] (lists the Drive backups when omitted; --yes skips the question)",
  name: "restore"
});

function readable(path: string) {
  try {
    readFileSync(path, { flag: "r" }).subarray(0, 1);
    return true;
  } catch {
    return false;
  }
}
