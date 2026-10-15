import { isCancel, cancel, text } from "@clack/prompts";

import { collectCommits, assertRepo, readEmail } from "../../lib/timesheet/git";
import { parsePtBrDate, dateError } from "../../lib/timesheet/dates";
import { defineCommand, type Flags } from "../../lib/command";
import { groupByDay } from "../../lib/timesheet/group";
import { summary, info } from "../../ui/summary";

function flagDate(name: string, value: string) {
  const date = parsePtBrDate(value);
  if (!date) throw new Error(`--${name}: ${dateError(value) ?? "data inválida"}`);
  return date;
}

async function askSince(): Promise<string | undefined> {
  const answer = await text({
    message: "A partir de qual data? (DD/MM/AAAA, opcional)",
    placeholder: "em branco = todo o histórico",
    validate: (value) => dateError(value ?? "")
  });
  if (isCancel(answer)) {
    cancel("cancelled");
    process.exit(130);
  }
  return answer.trim() ? flagDate("since", answer) : undefined;
}

async function resolveSince(flags: Flags) {
  if (flags.since) return flagDate("since", flags.since);
  if (flags.json || !process.stdin.isTTY) return undefined;
  return askSince();
}

export const explore = defineCommand({
  run: async (_args, flags) => {
    const cwd = process.cwd();
    await assertRepo(cwd);
    const email = await readEmail(cwd);
    const since = await resolveSince(flags);
    const until = flags.until ? flagDate("until", flags.until) : undefined;

    const commits = await collectCommits({ since, until, email, cwd });

    if (flags.json) return void process.stdout.write(`${JSON.stringify(commits, null, 2)}\n`);
    if (!commits.length) return info(`no commits for ${email}`);

    const days = groupByDay(commits);
    for (const { commits: list, day } of days) {
      const rows = list.map((c) => ({ name: `${c.date.slice(11, 16)}  ${c.hash.slice(0, 7)}`, detail: c.subject }));
      summary(`${day} · ${list.length}`, rows);
    }
    info(`${commits.length} commits · ${days.length} days · ${email}`);
  },
  description: "list your commits (git user.email) in the current repo, grouped by day",
  aliases: ["ex"],
  name: "explore"
});
