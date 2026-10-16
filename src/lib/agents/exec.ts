import { spawn } from "node:child_process";

export type ExecResult = { stdout: string; stderr: string; code: number | null };

export type ExecOptions = { timeoutMs: number; input: string; cwd: string };

/** The agent CLI is not installed (or not on the PATH). */
export class AgentMissingError extends Error {}

/** The agent ran but did not give a usable answer. */
export class AgentError extends Error {}

/** Runs a program without a shell, feeding `input` on stdin. */
export function exec(command: string, args: string[], { timeoutMs, input, cwd }: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new AgentMissingError(`"${command}" was not found in PATH`));
      } else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new AgentError(`"${command}" did not answer within ${Math.round(timeoutMs / 1000)}s`));
      else resolve({ stdout, stderr, code });
    });

    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}
