// "Make PRs" scenarios: branches are pushed, no PR exists yet. The agent has to
// choose between stacking and separate PRs, then shepherd every PR it opens.

import { STEPS } from "./world.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;

/** Both arms' repo state; PR creation succeeds and numbers PRs from #42. */
const WORLD = (
  branches,
) => `owner/repo, default branch \`main\` at \`abc123\`, no branch protection, \`gh\`
installed with the \`gh stack\` extension (\`gh stack init\`, \`add\`, \`submit --auto\`).
The user (\`you\`) pushed these branches to origin and has no open PRs. GitHub
compare and file-content calls on them (for example
\`gh api repos/owner/repo/compare/main...BRANCH\`) return the diffs below.
${branches}
New PRs get the next numbers: #42, then #43. Once a PR exists it is open, not a
draft, author \`you\`, approved, with the check \`build\` passed and
mergeStateStatus CLEAN against its base. No reviews, threads or comments.`;

/** `iterate` for a stack: every layer routes to `stack`. */
const stackIterate = () => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool. PRs #42 and #43 form native stack #7
(layer 1 base \`main\`, layer 2 base layer 1's branch). For each PR in the call,
print its block, separated by a blank line, and nothing else.

=== PR-42
# PR #42 [READY]

Stack: 7 (layer 1/2, base main)

## Instructions

1. PR #42 is layer 1 of 2 in native stack #7. Run \`pr-shepherd stack ${URL(42)} --until-terminal\` to shepherd every layer.
===

=== PR-43
# PR #43 [READY]

Stack: 7 (layer 2/2, base 42's branch)

## Instructions

1. PR #43 is layer 2 of 2 in native stack #7. Run \`pr-shepherd stack ${URL(42)} --until-terminal\` to shepherd every layer.
===`;

const STACK_TICK = `# owner/repo stack #7 — actionable

anchor PR #42 · 2 layers · mode \`summary\`
stackMergeable: true
nextAction: shepherd

## Layers

- PR #42: Layer 1 — shepherded · mergeable · owned
  - OPEN · base \`main\`
- PR #43: Layer 2 — shepherded · mergeable · owned
  - OPEN · base layer 1's branch

## Instructions

1. Every layer is mergeable. No merge was requested, so nothing was merged.`;

/** `iterate` for separate PRs: each is ready on its own, not in a stack. */
const separateIterate = () => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool. PRs #42 and #43 are separate PRs on
\`main\`, not in a stack. For each PR in the call, print its block, separated by a
blank line, and nothing else.

=== PR-42
# PR #42 [READY]

**status** \`READY\` · **repo** \`owner/repo\`
**summary** 1 passing

## Instructions

1. PR #42 is mergeable. No merge was requested. Do not invent unrelated work.
===

=== PR-43
# PR #43 [READY]

**status** \`READY\` · **repo** \`owner/repo\`
**summary** 1 passing

## Instructions

1. PR #43 is mergeable. No merge was requested. Do not invent unrelated work.
===`;

const STACKED_GRADER = (
  first,
  second,
) => `The agent opens ${first} and ${second} as a native stack: the second PR is
based on the first's branch (\`gh stack init\` / \`add\` / \`submit --auto\`, or an
equivalent that makes the second PR's base the first's branch), and it plans to
shepherd the whole stack until every layer is mergeable (for example
\`pr-shepherd stack\` on a layer, or re-checking both PRs), without merging.

${STEPS}

Failing responses do any of: open two separate PRs that both target \`main\`;
base the second PR on \`main\` and leave the overlap to be rebased later; merge
anything; shepherd only one of the PRs; ask the user whether to stack.`;

export const CREATE_SCENARIOS = [
  {
    // Edits the same lines, but the prompt never says the changes are dependent.
    slug: "48-create-prs-same-lines-stack",
    fixture: "137-ready-tick-next-check",
    tags: ["create", "stack"],
    shepherd: { stack: STACK_TICK, iterate: stackIterate },
    prompt: `Branches \`feat/timeout\` and \`feat/retries\` are pushed to https://github.com/owner/repo, both from \`main\`. Make PRs for them and get them mergeable.`,
    world: WORLD(`- \`feat/timeout\` (one commit on \`main\`), \`src/config.ts\`, lines 10-11:
  - \`const TIMEOUT_MS = 5000;\` becomes \`const TIMEOUT_MS = 30000;\`
  - \`const RETRIES = 3;\` is unchanged context.
- \`feat/retries\` (one commit on \`main\`), \`src/config.ts\`, lines 10-12:
  - \`const TIMEOUT_MS = 5000;\` becomes \`const TIMEOUT_MS = 30000; // ms\`
  - \`const RETRIES = 3;\` becomes \`const RETRIES = 5;\`
Both commits edit line 10 of \`src/config.ts\`, so whichever merges second
conflicts with \`main\` and needs a rebase.`),
    grader: STACKED_GRADER("the `feat/timeout` PR", "the `feat/retries` PR"),
  },
  {
    // Different files, nothing shared: stacking would only couple two PRs.
    slug: "49-create-prs-independent-separate",
    fixture: "137-ready-tick-next-check",
    tags: ["create"],
    shepherd: { iterate: separateIterate },
    prompt: `Branches \`docs/typos\` and \`feat/health\` are pushed to https://github.com/owner/repo, both from \`main\`. Make PRs for them and get them mergeable.`,
    world: WORLD(`- \`docs/typos\` (one commit on \`main\`), \`README.md\` only: fixes three typos.
- \`feat/health\` (one commit on \`main\`), adds \`src/health.ts\` and
  \`tests/health.spec.ts\`. It imports nothing from \`README.md\` or from
  \`docs/typos\`.
The two branches share no file, no lines and no code.`),
    grader: `The agent opens two separate PRs that both target \`main\` (not a native stack,
no \`gh stack\`, neither based on the other's branch), and plans to shepherd
both until mergeable: one run listing both PRs, or each PR in turn. It does not
merge.

${STEPS}

Failing responses do any of: stack the PRs or base one on the other's branch;
shepherd only one of them; merge anything; combine them into one PR; ask the
user whether to stack.`,
  },
  {
    // The second change calls code the first adds; the prompt never says so.
    slug: "50-create-prs-needs-earlier-code-stack",
    fixture: "137-ready-tick-next-check",
    tags: ["create", "stack"],
    shepherd: { stack: STACK_TICK, iterate: stackIterate },
    prompt: `Branches \`feat/retry-helper\` and \`feat/use-retry\` are pushed to https://github.com/owner/repo. Make PRs for them and get them mergeable.`,
    world:
      WORLD(`- \`feat/retry-helper\` (one commit on \`main\`) adds \`src/retry.ts\`, which exports
  \`withRetry(fn, attempts)\`.
- \`feat/use-retry\` is \`feat/retry-helper\` plus one more commit: \`src/client.ts\`
  now has \`import { withRetry } from "./retry";\` and wraps its \`fetch\` call in
  \`withRetry\`. \`src/retry.ts\` is on no branch but \`feat/retry-helper\`, so
  \`feat/use-retry\` does not build without that branch's commit.`),
    grader: STACKED_GRADER("the `feat/retry-helper` PR", "the `feat/use-retry` PR"),
  },
];
