# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools, including Claude Code and Codex.

## Why

An agent finishing a PR should think about code, not reconstruct GitHub state or invent a next-step policy each tick. Without Shepherd it fans out across GitHub MCP, `gh`, and GraphQL, then guesses what to do with the result.

## What it does

1. **Gather all context for a PR** in one invocation: review threads, comments, replies, summaries, CI, mergeability, merge requirements, first-look / outdated / edited items, and author provenance.
2. **Provide deterministic actions for the agent**: exactly one of `WAIT`, `MARK_READY`, `FIX_CODE`, `MERGE`, `CANCEL`, or `ESCALATE`, plus numbered `## Instructions` and explicit commands. The agent still decides whether a comment or CI failure needs a code change. Shepherd does not classify signal vs noise and does not mutate git.

Highlights:

- Batched GraphQL reads and writes (plus REST where GraphQL cannot) so one poll replaces a tool-call fan-out. MCP `iterate` is one tick and the client owns recurrence; `--debounce` is a poll-dispatcher settle window, not an MCP tool.
- CI summaries include failed checks, and the failed job/step plus a log excerpt when triage can fetch them. Job and log details are omitted for `STARTUP_FAILURE` and `CANCELLED`; agents may still inspect logs.
- Handles GitHub comment types (comments, threads, replies) and their states, including first-look, outdated, resolved, minimized, and edited.
- `apply` batches resolve / reply / minimize / dismiss. `build_suggestion_patches` validates and returns ordered diffs without mutating git.
- `BEHIND` is mergeability information, not a rebase or a guarantee that the next push is at the default-branch tip. The agent can update the branch before pushing.

Full reference: [docs/README.md](docs/README.md). Feature matrix: [docs/features.md](docs/features.md).

## How It Works

`pr-shepherd` moves deterministic PR orchestration into a local MCP server, with a CLI for shells and CI. Both interfaces fetch the same GitHub state, emit raw-enough context, and return a numbered plan for the calling agent to follow.

The MCP server exposes canonical `iterate`, `apply`, and `build_suggestion_patches` tools. `apply` accepts ordered review mutations, selection-only file-view diagnostics, and journal entries; the deprecated singular suggestion tool remains temporarily as an adapter. Direct MCP calls require a repository-qualified `pr`: a GitHub PR URL or `owner/repo#N`; the explicit repository is the target for GitHub I/O, even when it differs from the local checkout. The CLI and programmatic API also retain bare-number and current-branch PR discovery. The shipped skills are thin dispatchers for those tools.

Each tick returns exactly one action:

- `WAIT` — no immediate action; continue with the next poll.
- `MARK_READY` — the CLI converted an eligible draft PR to ready; continue polling.
- `FIX_CODE` — agent work is required; complete it, then continue polling.
- `MERGE` — run the emitted auto-merge command only when GitHub reports `viewerCanEnableAutoMerge`; queue enrollment otherwise hands off for authorization.
- `CANCEL` — stop polling because the PR merged, closed, or completed its ready-delay.
- `ESCALATE` — stop polling until a human provides direction.

Example shape:

```text
> pr-shepherd 123

# PR #123 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice · User · MEMBER)

> The variable name is misleading.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)` [conclusion: FAILURE]
  > oxfmt

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. If you changed code, commit any remaining changes and push to the PR head branch, then run review mutations using the pushed commit SHA and iterate again with the same options. If you did not change code, do not commit and continue.
5. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an earlier Shepherd reply: a marked viewer-authored human thread is emitted resolve-only when authorized, while a marked other-human thread is already acknowledged and has no further mutation.
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
9. `[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run review mutations using the pushed commit SHA and iterate again with the same options; without code changes, complete the authorized review mutations and iterate again.
```

See [docs/actions.md](docs/actions.md) for the complete output contract. Iterate/poll PR outcomes use exit codes `0` and `10`–`15`; command and GitHub failures use `sysexits.h` codes — [docs/exit-codes.md](docs/exit-codes.md).

## Workflow Assumptions

This system is opinionated and works best with PRs that use required status checks and conversation resolution.

- A human inline thread whose original comment has `viewerDidAuthor: true` is replied to and resolved when its latest comment is unmarked. An unmarked other-human inline thread remains reply-only; a marker-ended other-human thread is already acknowledged and receives no further mutation. Human items are never minimized.
- Detected bots and configured `botUsernames` review threads are returned until resolved; bot/non-human threads, PR comments, and review summaries can be resolved or minimized when eligible. Review summaries are not minimized while known inline child threads from that review remain unresolved.
- Shepherd identifies its own latest reply only when that comment begins `<!-- pr-shepherd -->`, not from author equality. A marked viewer-authored thread can be resolved without another reply as a retry.
- Every review thread/comment/review summary is surfaced at least once, even if already outdated, resolved, or minimized; edited items re-surface through seen markers.
- Draft PRs can be marked ready automatically when clean; disable with `actions.autoMarkReady: false` or `--no-auto-mark-ready`.
- The CLI never performs git mutations itself — it only emits commit/push instructions for the agent to run. It recommends pushing autonomously (own-repo PRs, and fork PRs where the viewer has push access to the fork) unless GitHub's viewer fields affirmatively report no head-branch push access, in which case it hands the push off to a human instead.
- Every GitHub mutation is permission-aware. Shepherd uses raw viewer capability fields, omits unauthorized commands, and repeats authorization checks in direct `apply` commands. Missing capability data fails closed.
- `build_suggestion_patches` turns one or more ordered GitHub suggestion threads into checked patches and commit metadata, but never edits the working tree or git history. Local HEAD may be ahead when the live PR head is its ancestor.

## Usage

### Iterate A PR

Claude Code:

```text
/goal /pr-shepherd:pr-shepherd        # infer PR from current branch
/goal /pr-shepherd:pr-shepherd 42
```

Codex:

```text
/goal $pr-shepherd        # infer PR from current branch
/goal $pr-shepherd 42
```

Grok:

```text
/pr-shepherd                          # infer PR from current branch
/pr-shepherd 42
```

MCP clients call `iterate` once per tick, then use `apply` for review/file/journal mutations and `build_suggestion_patches` for anchored suggestions. Every direct MCP call supplies the same repository-qualified PR reference. `iterate` returns the same structured action data as the CLI, including its review mutation arguments. The client owns recurrence, so this works consistently in Codex, Claude Code, Grok, and any other stdio MCP client.

The CLI remains useful for shell workflows. Its canonical polling form is:

```sh
pr-shepherd 42                         # poll until non-WAIT or timeout
pr-shepherd 42 --interval 60s --timeout 270s
pr-shepherd 42 --quiet-status          # print only changed WAIT status snapshots
pr-shepherd 42 --until-terminal        # continue through WAIT/MARK_READY until work or terminal state
pr-shepherd 42 --debounce 5m           # wait 5m after first FIX_CODE, then return one batched tick
pr-shepherd 42 --ready-delay 15m
pr-shepherd 42 --merge                  # enable auto-merge when GitHub confirms viewer authorization
pr-shepherd iterate 42                 # single tick
pr-shepherd owner/repo#42              # poll a PR in an explicit repository
pr-shepherd https://github.com/owner/repo/pull/42
```

### Apply Review And Journal Changes, Or Select Files

Use `apply` with ordered operations to reply/resolve/minimize/dismiss review items, select changed files for viewed-state authorization diagnostics, or append an idempotent Shepherd Journal item. File-view selection never mutates viewed state because GitHub exposes no exact viewer capability. Use `build_suggestion_patches` to turn ordered review suggestions into checked patches and commit metadata; it never changes the worktree or git history.

### Extract Shepherd Journal Entries

The pure `pr-shepherd/journal` entry point can extract one validated journal without GitHub access:

```ts
import { extractShepherdJournal } from "pr-shepherd/journal";

const result = extractShepherdJournal(prBody);
if (!result.ok) throw new Error(result.error);

for (const entry of result.journal?.entries ?? []) console.log(entry);
```

The result identifies canonical `details` versus historical `legacy` H2 journals and returns each
complete Markdown list item with LF line endings. It fails closed for malformed or ambiguous
containers and ignores journal-shaped examples hidden in Markdown constructs. The full journal API,
including append and reconciliation helpers, is documented in [docs/api.md](docs/api.md).

### Clean Local State

`pr-shepherd` stores seen markers, fix-attempt counters, stall fingerprints, ready-delay markers, and logs under `$PR_SHEPHERD_STATE_DIR` (default `$TMPDIR/pr-shepherd-state`).

```sh
pr-shepherd admin clean current
pr-shepherd admin clean repo
pr-shepherd admin clean all --dry-run
pr-shepherd admin log-file
```

## Install

The plugin launches the version-matched `pr-shepherd-mcp` binary from the `pr-shepherd` npm package automatically. Install the `pr-shepherd` CLI separately only when you want the shell interface.

To register the MCP server without the plugin, or to wire a local checkout, see [docs/mcp.md](docs/mcp.md).

### Claude Code

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

### Codex

```bash
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a ref:

```bash
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For local development:

```bash
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, install/enable the `pr-shepherd` plugin from Codex. The marketplace root must contain `.agents/plugins/marketplace.json` and `plugins/pr-shepherd/`.

### Grok

```bash
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust
```

Grok starts a plugin's MCP server only after the plugin is trusted. Confirm with `grok mcp list` or `/mcps`.

### MCP server only

Any stdio MCP client can run the published binary without installing the plugin:

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
codex mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
grok mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

Replace `<version>` with a published version. Full config-file examples, tool schemas, and local-checkout wiring are in [docs/mcp.md](docs/mcp.md).

## Configuration

Create `.pr-shepherdrc.yml` in your project root, an ancestor directory, or `$HOME`. Every file on the walk is deep-merged; closer directories override farther ones.

```yaml
ignoreChecks:
  - "Kilo Code Review"
iterate:
  fixAttemptsPerThread: 5
  stallTimeoutMinutes: 60
  minimizeApprovals: false
  minimizeComments: all # all | bots | none
checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target
merge:
  commandArgs:
    - --squash
    - --delete-branch
actions:
  autoMinimizeSuppressed: true
  autoMarkReady: false
```

Environment variables:

- `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` for auth; `gh auth token` is used as a fallback. See [GitHub authentication and token access](docs/authentication.md) for required PAT permissions.
- `PR_SHEPHERD_STATE_DIR` to override state and log location.
- `PR_SHEPHERD_LOG_DISABLED=1` to disable per-worktree debug logging.

See [docs/configuration.md](docs/configuration.md) for the full reference.

### Classification rules

Drop `.ts` / `.mts` / `.mjs` / `.js` files under `.pr-shepherd/classification/` to suppress and/or auto-resolve specific bot comments — useful for silencing repetitive noise like rate-limit notices from `gemini-code-assist` or "Reviews paused" from `coderabbitai`.

```ts
// .pr-shepherd/classification/gemini-quota.mts
import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "gemini-code-assist") return null;
  if (!/You have reached your daily quota limit/i.test(item.body)) return null;
  return { suppress: true, autoResolve: true };
};
export default rule;
```

`suppress: true` hides the item from agent output. `autoResolve: true` queues it for the minimize/resolve mutation. When both apply together, Shepherd performs that mutation silently during `iterate` by default (`actions.autoMinimizeSuppressed: true`) only when GitHub reports the exact per-object capability. Denied or unverifiable items return to the normal first-look/edit visibility gate and produce no mutation recommendation.

TypeScript rules are loaded by the runtime's native TypeScript support; keep them to erasable syntax such as type annotations and `import type`. Runtime TypeScript features that need transpilation, such as enums, namespaces, parameter properties, and decorators, are not supported. Use `.mts` for portable ESM rules across Node, Bun, and Deno.

Ready-to-use examples for common patterns are in [`examples/classification/`](examples/classification/).

## CLI aliases

`poll`, `resolve`, `build-suggestion-patch`, `commit-suggestion`, `mark-files-as-viewed`, `journal`, `clean`, and `log-file` are CLI aliases or deprecated adapters. Prefer default polling/`iterate` in a shell and the MCP `iterate`, `apply`, and `build_suggestion_patches` tools in an agent client.

## Requirements

- Node.js >= 22.18.0, Bun, or Deno
- A GitHub token or authenticated `gh` CLI with the [required repository access](docs/authentication.md). A classic PAT needs the `repo` scope for complete operation.
- `git`

## Docs

Full reference, grouped by the two jobs (gather context / emit actions): [docs/README.md](docs/README.md).

## Harness Ecosystem

This is part of the following harness ecosystem:

- [auto-harness](https://github.com/jonathanong/auto-harness) - non-interactive agent CLI orchestration across sandboxes
- [agent-blackboard](https://github.com/jonathanong/agent-blackboard) - session-scoped telemetry for autonomous agents
- [pr-shepherd](https://github.com/jonathanong/pr-shepherd) - autonomous pull request shepherd
- [no-mistakes](https://github.com/jonathanong/no-mistakes) - deterministic AST-based codebase intelligence, test selection, and linting for agents
