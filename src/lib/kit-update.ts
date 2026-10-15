import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import { pkg } from "./pkg";

export type Manager = "npm" | "pnpm";

export async function latestVersion(): Promise<string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${pkg.config.releaseRepo}/releases/latest`, {
    cache: "no-store",
    headers
  }).catch((e: Error) => {
    throw new Error(`cannot reach github.com (${e.message})`);
  });
  if (!res.ok) throw new Error(`cannot read latest release: ${res.status} ${res.statusText}`);
  const { tag_name } = (await res.json()) as { tag_name?: string };
  if (!tag_name) throw new Error("latest release has no tag");
  return tag_name.replace(/^v/, "");
}

export function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function installSource(): { ephemeral: boolean; manager: Manager } {
  const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
  const ephemeral = /[\\/](_npx|dlx)[\\/]/.test(entry) || entry.startsWith(tmpdir());
  return { manager: /pnpm/i.test(entry) ? "pnpm" : "npm", ephemeral };
}

export const assetUrl = (version: string) =>
  `https://github.com/${pkg.config.releaseRepo}/releases/download/v${version}/workbench.tgz`;

export const installArgs = (manager: Manager, url: string) => (manager === "pnpm" ? ["add", "-g", url] : ["install", "-g", url]);
