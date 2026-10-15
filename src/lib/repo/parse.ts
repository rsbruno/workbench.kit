export type Parsed = {
  titleBranch: string | null;
  type: string | null;
  isBreaking: boolean;
};

const CONVENTIONAL = /^(\w+)(?:\([^)]+\))?(!)?:\s/;
const BRACKET = /^\[([A-Za-z]+)(!)?\]\[[^\]]+\](?:\[([^\]]*)\])?/;
const BREAKING = /^BREAKING[ -]CHANGE:/m;

export function parseMessage(subject: string, body: string): Parsed {
  let type: string | null = null;
  let titleBranch: string | null = null;
  let isBreaking = false;

  const bracket = BRACKET.exec(subject);
  const conventional = bracket ? null : CONVENTIONAL.exec(subject);
  if (bracket) {
    type = bracket[1]!.toLowerCase();
    isBreaking = Boolean(bracket[2]);
    titleBranch = bracket[3]?.trim().toLowerCase() || null;
  } else if (conventional) {
    type = conventional[1]!.toLowerCase();
    isBreaking = Boolean(conventional[2]);
  }
  if (BREAKING.test(body)) isBreaking = true;

  return { titleBranch, isBreaking, type };
}
