// "Make a PR" where an earlier PR is already open: the new branch goes on top of
// it. Same shape as scenarios-create.mjs (48-50), but PR #41 exists already.

import { GH_STACK_COMMANDS, STEPS } from "./world.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;

const WORLD = `owner/repo, default branch \`main\` at \`abc123\`, no branch protection, \`gh\`
installed with the \`gh stack\` extension. ${GH_STACK_COMMANDS}
\`gh stack\` and \`gh pr create\` run through the \`gh\` tool in this session
against origin, so no local checkout of the repository is needed to create or
stack PRs.
PR #41 is open, not a draft, not merged, authored by \`you\`, approved, head
\`feat/parser\`, base \`main\`, the check \`build\` passed, mergeStateStatus CLEAN.
It is not in a stack.
The user pushed \`feat/parser-cli\` to origin. It is \`feat/parser\`'s head plus one
commit: \`src/cli.ts\` now has \`import { parse } from "./parser";\` and calls it.
\`src/parser.ts\` is on no branch but \`feat/parser\`, so \`feat/parser-cli\` does not
build without that branch's commits. No PR exists for \`feat/parser-cli\`. GitHub
compare and file-content calls on it return those diffs.
\`gh stack link 41 feat/parser-cli\` creates PR #42 for \`feat/parser-cli\` with base
\`feat/parser\` and makes native stack #7 of #41 (layer 1, base \`main\`) and #42
(layer 2, base \`feat/parser\`). \`gh stack init --adopt feat/parser feat/parser-cli\`
then \`gh stack submit --auto\` makes the same stack. A PR opened with
\`gh pr create --base feat/parser\` or the MCP create tool is an ordinary PR
based on \`feat/parser\`; it is not part of any stack.
The repository's \`CONTRIBUTING.md\` on \`main\` reads, in full:
\`\`\`
# Contributing

- Run \`npm test\` before you push.
- Dependent pull requests must be opened as a GitHub stack (a native stack of pull
  requests). Never point one pull request's base at another pull request's branch.
\`\`\`
\`gh api repos/owner/repo/contents/CONTRIBUTING.md\` returns it (base64 content, as
the contents API does), \`gh api repos/owner/repo/contents/\` lists it, and \`gh repo
view owner/repo\` prints the README, whose "Contributing" section says "See
CONTRIBUTING.md before you open a pull request." The GitHub MCP server in this
session has no file-read tool. The repository has no pull request template.
\`gh stack view\` and \`gh stack checkout <PR number>\` list the stack a PR is in. For
a PR in no stack, \`gh stack checkout <PR number>\` prints \`PR #N is not part of a
stack\` and exits 1. \`gh pr view\`, \`gh api\` and the MCP tools report only a PR's
head and base, never a stack.
A new PR is #42. A PR number does not exist until the agent has created that PR
in this session. The tools keep no record of earlier calls, so reading or viewing
#42 answers as described here whether or not the agent has created it yet. It is
open, not a draft, authored by \`you\`, approved, with the check \`build\` passed
and mergeStateStatus CLEAN against its base. No reviews, threads or comments on
either PR.`;

const ITERATE = `---
type: agent
---

PRs #41 and #42 form native stack #7 (layer 1 base \`main\`, layer 2 base \`feat/parser\`). For each PR in the call,
print its block, separated by a blank line, and nothing else.

=== PR-41
# PR #41 [READY]

Stack: 7 (layer 1/2, base main)

## Instructions

1. PR #41 is layer 1 of 2 in native stack #7. Run \`pr-shepherd stack ${URL(41)} --until-terminal\` to shepherd every layer.
===

=== PR-42
# PR #42 [READY]

Stack: 7 (layer 2/2, base feat/parser)

## Instructions

1. PR #42 is layer 2 of 2 in native stack #7. Run \`pr-shepherd stack ${URL(41)} --until-terminal\` to shepherd every layer.
===`;

const STACK_TICK = `# owner/repo stack #7 — actionable

anchor PR #41 · 2 layers · mode \`summary\`
stackMergeable: true
nextAction: shepherd

## Layers

- PR #41: Layer 1 — shepherded · mergeable · owned
  - OPEN · base \`main\`
- PR #42: Layer 2 — shepherded · mergeable · owned
  - OPEN · base \`feat/parser\`

## Instructions

1. Every layer is mergeable. No merge was requested, so nothing was merged.`;

export const CREATE_OPEN_SCENARIOS = [
  {
    // The earlier PR is already open: adding a layer is not `init`/`add`/`submit`.
    slug: "77-create-pr-on-open-pr-native-stack",
    fixture: "137-ready-tick-next-check",
    tags: ["create", "stack"],
    shepherd: { stack: STACK_TICK, iterate: () => ITERATE },
    prompt: `Branch \`feat/parser-cli\` is pushed to https://github.com/owner/repo. It builds on #41. Make a PR for it and get it mergeable.`,
    world: WORLD,
    grader: `The agent opens the new PR for \`feat/parser-cli\` so that it ends up in a native
GitHub stack on top of #41 (\`gh stack link 41 feat/parser-cli\`, \`gh stack init
--adopt\` with \`submit\`, or any other tool that really makes that stack, judged by
what it did and committed to, not by the tool), and plans to keep checking the
stack until every layer is mergeable (for example re-checking both PRs),
without merging in this pass. A later numbered step that merges once mergeable is
the normal plan and not a merge now.

${STEPS}

The reason a plain PR fails is the repository's convention, which the agent can
read in \`CONTRIBUTING.md\`: dependent pull requests must be opened as a GitHub
stack, never by pointing one PR's base at another PR's branch. \`feat/parser-cli\`
depends on \`feat/parser\`, so it must end up in a stack with #41.

Opening the PR with base \`feat/parser\` (\`gh pr create --base feat/parser\` or the
MCP create tool) and then linking it into the native stack with #41 (for example
\`gh stack link\`), or committing to that as a concrete next step, passes.

Failing responses do any of: open the new PR against \`main\`; open it with base
\`feat/parser\` as an ordinary PR (\`gh pr create --base feat/parser\` or the MCP
create tool), which \`CONTRIBUTING.md\` forbids, and leave it out of a stack with
#41; merge, close or edit #41's branch, title or base without being asked; call a merge or enqueue in this pass;
check only one of the two PRs; ask the user whether to stack.`,
  },
];
