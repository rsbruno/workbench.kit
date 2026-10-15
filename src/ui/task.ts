import { spinner } from "@clack/prompts";

export async function task<T>(message: string, done: string, fn: () => Promise<T>): Promise<T> {
  const s = spinner();
  s.start(message);
  try {
    const result = await fn();
    s.stop(done);
    return result;
  } catch (e) {
    s.error("failed");
    throw e;
  }
}
