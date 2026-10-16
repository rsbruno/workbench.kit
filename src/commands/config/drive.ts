import { writeConfig, readConfig } from "../../lib/config";
import { defineCommand } from "../../lib/command";
import { info, warn } from "../../ui/summary";
import { askText } from "../../ui/prompt";
import { connect } from "../../lib/drive";

const required = (label: string) => (value: string) => (value ? undefined : `${label} é obrigatório`);

export const drive = defineCommand({
  run: async (_args, flags) => {
    const current = readConfig().drive;

    if (flags.disconnect) {
      writeConfig({ drive: undefined });
      return info(current ? "Google Drive desconectado" : "o Google Drive já estava desconectado");
    }

    if (current) info(`conectado como ${current.email ?? "(conta sem e-mail)"}; vou reconectar`);
    else info("crie um OAuth client do tipo Desktop em console.cloud.google.com (API do Drive ativada) e informe as chaves");

    const clientId =
      flags.client ??
      process.env.WORKBENCH_GOOGLE_CLIENT_ID ??
      (await askText("Client ID", { validate: required("Client ID"), initial: current?.clientId }));
    const clientSecret =
      flags.secret ??
      process.env.WORKBENCH_GOOGLE_CLIENT_SECRET ??
      (await askText("Client secret", { validate: required("Client secret") }));

    const result = await connect(clientId, clientSecret, (url) => warn(`abra no navegador para autorizar:\n${url}`));
    writeConfig({ drive: result });
    info(`Google Drive conectado${result.email ? ` como ${result.email}` : ""}`);
  },
  description: "connect the Google account that stores backups: drive [--client id --secret secret] [--disconnect]",
  name: "drive"
});
