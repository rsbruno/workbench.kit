const TITLE_PATTERN = /^\[([A-Z]+!?)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?: (.+)$/;

const SECTIONS = {
  PERF: "Performance Improvements",
  "REFACTOR!": "Breaking Changes",
  REFACTOR: "Code Refactoring",
  "FEAT!": "Breaking Changes",
  "PERF!": "Breaking Changes",
  "FIX!": "Breaking Changes",
  FEAT: "Features",
  FIX: "Bug Fixes"
};

const RELEASE_RULES = [
  { type: "REFACTOR!", release: "major" },
  { release: "major", type: "FEAT!" },
  { release: "major", type: "PERF!" },
  { release: "major", type: "FIX!" },
  { release: "minor", type: "FEAT" },
  { release: "patch", type: "PERF" },
  { release: "patch", type: "FIX" }
];

const parserOpts = {
  headerCorrespondence: ["type", "scope", "branch", "card", "subject"],
  headerPattern: TITLE_PATTERN
};

export default {
  plugins: [
    ["@semantic-release/commit-analyzer", { releaseRules: RELEASE_RULES, parserOpts }],
    [
      "@semantic-release/release-notes-generator",
      {
        writerOpts: {
          transform: (commit) => {
            const section = SECTIONS[commit.type];
            if (!section) return undefined;
            return { ...commit, shortHash: commit.hash?.slice(0, 7), type: section };
          }
        },
        parserOpts
      }
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "npm pkg set version=${nextRelease.version} && bun run build && npm pack --silent && mv workbench-${nextRelease.version}.tgz workbench.tgz"
      }
    ],
    [
      "@semantic-release/github",
      {
        assets: [{ label: "workbench.tgz (npx / pnpm dlx)", path: "workbench.tgz" }],
        releasedLabels: false,
        successComment: false,
        failComment: false
      }
    ]
  ],
  branches: ["main"]
};
