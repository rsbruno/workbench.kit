import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

import type { DriveConfig } from "./config";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
// drive.file only reaches files this app created, never the rest of the user's Drive
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
// Workbench-cli/backups: room for other kinds of files next to the backups later
const FOLDER_PATH = ["Workbench-cli", "backups"];
const FOLDER_MIME = "application/vnd.google-apps.folder";
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export type DriveFile = { createdTime: string; size: number; name: string; id: string };

const base64url = (buffer: Buffer) => buffer.toString("base64url");

function openBrowser(url: string) {
  const [cmd, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // the URL is printed too, so a missing opener is not fatal
  }
}

async function tokenRequest(
  body: Record<string, string>
): Promise<{ refresh_token?: string; access_token: string; id_token?: string }> {
  const response = await fetch(TOKEN_URL, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    method: "POST"
  });
  const data = (await response.json()) as Record<string, string>;
  if (!response.ok) {
    const reason =
      data.error === "invalid_grant"
        ? "acesso revogado ou expirado; reconecte com workbench config drive"
        : (data.error_description ?? data.error);
    throw new Error(`Google recusou a autenticação: ${reason}`);
  }
  return data as { refresh_token?: string; access_token: string; id_token?: string };
}

function emailOf(idToken?: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1]!, "base64url").toString("utf8")) as { email?: string };
    return payload.email;
  } catch {
    return undefined;
  }
}

/** OAuth for desktop apps: loopback redirect + PKCE. `onUrl` receives the consent link (also opened in the browser). */
export async function connect(clientId: string, clientSecret: string, onUrl: (url: string) => void): Promise<DriveConfig> {
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(16));

  const { port, code } = await new Promise<{ code: Promise<string>; port: number }>((resolveStart, rejectStart) => {
    let settle!: { resolve: (c: string) => void; reject: (e: Error) => void };
    const code = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") return void res.writeHead(404).end();
      const error = url.searchParams.get("error");
      const received = url.searchParams.get("code");
      const ok = !error && received && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        ok ? "workbench conectado ao Google Drive. Pode fechar esta aba." : "Não foi possível conectar. Volte ao terminal."
      );
      if (ok) settle.resolve(received);
      else settle.reject(new Error(error ? `autorização negada (${error})` : "resposta de autorização inválida"));
    });
    const timer = setTimeout(
      () => settle.reject(new Error("tempo esgotado esperando a autorização no navegador")),
      LOGIN_TIMEOUT_MS
    );
    const done = () => {
      clearTimeout(timer);
      server.close();
    };
    void code.then(done, done);
    server.on("error", rejectStart);
    server.listen(0, "127.0.0.1", () => resolveStart({ port: (server.address() as { port: number }).port, code }));
  });

  const redirect = `http://127.0.0.1:${port}`;
  const url = `${AUTH_URL}?${new URLSearchParams({
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    access_type: "offline",
    redirect_uri: redirect,
    response_type: "code",
    client_id: clientId,
    prompt: "consent",
    scope: SCOPE,
    state
  })}`;
  onUrl(url);
  openBrowser(url);

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_secret: clientSecret,
    code_verifier: verifier,
    redirect_uri: redirect,
    client_id: clientId,
    code: await code
  });
  if (!tokens.refresh_token)
    throw new Error("o Google não devolveu um refresh token; revogue o acesso do app na conta e tente de novo");
  return { refreshToken: tokens.refresh_token, email: emailOf(tokens.id_token), clientSecret, clientId };
}

export async function accessToken(drive: DriveConfig): Promise<string> {
  const tokens = await tokenRequest({
    refresh_token: drive.refreshToken,
    client_secret: drive.clientSecret,
    grant_type: "refresh_token",
    client_id: drive.clientId
  });
  return tokens.access_token;
}

async function api(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google Drive: ${body.error?.message ?? response.statusText}`);
  }
  return response;
}

const query = (q: string, fields: string) =>
  `${API}/files?${new URLSearchParams({ orderBy: "createdTime desc", pageSize: "100", spaces: "drive", fields, q })}`;

async function findChild(token: string, parent: string, name: string): Promise<string | undefined> {
  const q = `name = '${name}' and '${parent}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const { files } = (await (await api(token, query(q, "files(id)"))).json()) as { files: { id: string }[] };
  return files[0]?.id;
}

async function createChild(token: string, parent: string, name: string): Promise<string> {
  const response = await api(token, `${API}/files?fields=id`, {
    body: JSON.stringify({ mimeType: FOLDER_MIME, parents: [parent], name }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  return ((await response.json()) as { id: string }).id;
}

/** Walks Workbench-cli/backups from the Drive root; creates the missing levels only when asked. */
async function backupsFolder(token: string, create: boolean): Promise<string | undefined> {
  let parent = "root";
  for (const name of FOLDER_PATH) {
    const found = await findChild(token, parent, name);
    if (found) parent = found;
    else if (create) parent = await createChild(token, parent, name);
    else return undefined;
  }
  return parent;
}

export async function listBackups(token: string): Promise<DriveFile[]> {
  const folder = await backupsFolder(token, false);
  if (!folder) return [];
  const q = `'${folder}' in parents and trashed = false`;
  const { files } = (await (await api(token, query(q, "files(id,name,size,createdTime)"))).json()) as {
    files: (Omit<DriveFile, "size"> & { size?: string })[];
  };
  return files.map((f) => ({ ...f, size: Number(f.size ?? 0) }));
}

export async function uploadBackup(token: string, name: string, content: Buffer): Promise<DriveFile> {
  const parent = (await backupsFolder(token, true))!;
  const boundary = `workbench-${randomBytes(8).toString("hex")}`;
  const meta = JSON.stringify({ parents: [parent], name });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/gzip\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const response = await api(token, `${UPLOAD}?uploadType=multipart&fields=id,name,size,createdTime`, {
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    method: "POST",
    body
  });
  const file = (await response.json()) as Omit<DriveFile, "size"> & { size?: string };
  return { ...file, size: Number(file.size ?? content.length) };
}

export async function downloadBackup(token: string, id: string): Promise<Buffer> {
  const response = await api(token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  return Buffer.from(await response.arrayBuffer());
}
