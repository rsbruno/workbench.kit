import { spawnSync } from "node:child_process";

import { installSource, latestVersion, installArgs, assetUrl, isNewer } from "../../lib/kit-update";
import { defineCommand } from "../../lib/command";
import { info, warn } from "../../ui/summary";
import { task } from "../../ui/task";
import { pkg } from "../../lib/pkg";

export const update = defineCommand({
  run: async (_names, flags) => {
    const latest = await task("checking releases", "checked", latestVersion);
    if (!isNewer(latest, pkg.version) && !flags.force) return info(`already on the latest version · v${pkg.version}`);

    const { ephemeral, manager } = installSource();
    if (ephemeral) return info(`running through npx/dlx, which already fetches the latest on every run · latest is v${latest}`);

    const args = installArgs(manager, assetUrl(latest));
    const result = await task(`updating v${pkg.version} → v${latest}`, "updated", async () =>
      spawnSync(manager, args, { encoding: "utf8" })
    );
    if (result.status === 0) {
      info(`updated to v${latest}`);
      const migrated = await task("migrating the database", "migrated", async () =>
        spawnSync("workbench", ["kit", "migrate"], { env: { ...process.env, WORKBENCH_ENV: "prod" }, encoding: "utf8" })
      );
      if (migrated.status === 0) return info("database is up to date");
      warn(`migration failed (${migrated.error?.message ?? migrated.stderr.trim().split("\n").pop()})`);
      info("run it yourself: workbench kit migrate");
      process.exitCode = 1;
      return;
    }
    warn(`update failed (${result.error?.message ?? result.stderr.trim().split("\n").pop()})`);
    info(`run it yourself: ${manager} ${args.join(" ")}`);
    process.exitCode = 1;
  },
  description: "update the workbench CLI to the latest release",
  name: "update"
});
