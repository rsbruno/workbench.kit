import { existsSync } from "node:fs";
import { join } from "node:path";

import { writeConfig, readConfig } from "./config";
import { stateDir, dbFile } from "./paths";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_MAX_AGE_DAYS = 7;

/** Called after every successful backup, whether it went to Drive or to a local file. */
export const markBackup = (now = new Date()) => void writeConfig({ lastBackup: now.toISOString() });

/** A warning when the database exists but has no recent backup; undefined when all is fine. Never throws. */
export function backupReminder(now = new Date()): string | undefined {
  try {
    if (!existsSync(join(stateDir(), dbFile()))) return undefined;
    const { lastBackup } = readConfig();
    if (!lastBackup) return "you have not backed up the database yet. Run: workbench backup run";
    const days = Math.floor((now.getTime() - Date.parse(lastBackup)) / DAY_MS);
    if (days < BACKUP_MAX_AGE_DAYS) return undefined;
    return `the last backup was ${days} days ago. Run: workbench backup run`;
  } catch {
    return undefined;
  }
}
