import { writeConfig, readConfig } from "../../lib/config";
import { defineCommand } from "../../lib/command";
import { info, warn } from "../../ui/summary";
import { askText } from "../../ui/prompt";
import { connect } from "../../lib/drive";

const required = (label: string) => (value: string) => (value ? undefined : `${label} is required`);

export const drive = defineCommand({
  run: async (_args, flags) => {
    const current = readConfig().drive;

    if (flags.disconnect) {
      writeConfig({ drive: undefined });
      return info(current ? "Google Drive disconnected" : "Google Drive was already disconnected");
    }

    if (current) info(`connected as ${current.email ?? "(account without e-mail)"}; reconnecting`);
    else info("create a Desktop OAuth client at console.cloud.google.com (with the Drive API enabled) and enter its keys");

    const clientId =
      flags.client ??
      process.env.WORKBENCH_GOOGLE_CLIENT_ID ??
      (await askText("Client ID", { validate: required("Client ID"), initial: current?.clientId }));
    const clientSecret =
      flags.secret ??
      process.env.WORKBENCH_GOOGLE_CLIENT_SECRET ??
      (await askText("Client secret", { validate: required("Client secret") }));

    const result = await connect(clientId, clientSecret, (url) => warn(`open this in the browser to authorize:\n${url}`));
    writeConfig({ drive: result });
    info(`Google Drive connected${result.email ? ` as ${result.email}` : ""}`);
  },
  description: "connect the Google account that stores backups: drive [--client id --secret secret] [--disconnect]",
  name: "drive"
});
