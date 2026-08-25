# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools, including Claude Code and Codex.

## Why

An agent finishing a PR should think about code, not reconstruct GitHub state or invent a next-step policy each tick. Without Shepherd it fans out across GitHub MCP, `gh`, and GraphQL, then guesses what to do with the result.

## What it does

1. **Gather all context for a PR** in one invocation: review threads, comments, replies, summaries, CI, mergeability, merge requirements, first-look / outdated / edited items, and author provenance.
2. **Provide deterministic actions for the agent**: exactly one of `WAIT`, `MARK_READY`, `FIX_CODE`, `CANCEL`, or `ESCALATE`, plus numbered `## Instructions` and explicit `apply` / `build_suggestion_patch` mutations. The agent still decides whether a comment or CI failure needs a code change. Shepherd does not classify signal vs noise and does not mutate git.

Highlights:

- Batched GraphQL reads and writes (plus REST where GraphQL cannot) so one poll replaces a tool-call fan-out. MCP `iterate` is one tick and the client owns recurrence; `--debounce` is a poll-dispatcher settle window, not an MCP tool.
- CI summaries include failed checks, and the failed job/step plus a log excerpt when triage can fetch them. Job and log details are omitted for `STARTUP_FAILURE` and `CANCELLED`; agents may still inspect logs.
- Handles GitHub comment types (comments, threads, replies) and their states, including first-look, outdated, resolved, minimized, and edited.
- `apply` batches resolve / reply / minimize / dismiss. `build_suggestion_patch` emits a unified diff in output, not a patch file, and does not mutate git.
- `BEHIND` is mergeability information, not a rebase or a guarantee that the next push is at the default-branch tip. The agent can update the branch before pushing.

Full reference: [docs/README.md](docs/README.md). Feature matrix: [docs/features.md](docs/features.md).

## How It Works

`pr-shepherd` moves deterministic PR orchestration into a local MCP server, with a CLI for shells and CI. Both interfaces fetch the same GitHub state, emit raw-enough context, and return a numbered plan for the calling agent to follow.

The MCP server exposes three tools: `iterate`, `apply`, and `build_suggestion_patch`. `apply` accepts ordered review mutations, file-view mutations, and journal entries. The shipped skills are thin dispatchers for those tools.

Each tick returns exactly one action:

- `WAIT` — no immediate action; continue with the next poll.
- `MARK_READY` — the CLI converted an eligible draft PR to ready; continue polling.
- `FIX_CODE` — agent work is required; complete it, then continue polling.
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

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.
4. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
5. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
6. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
9. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
```

See [docs/actions.md](docs/actions.md) for the complete output contract. Iterate/poll PR outcomes use exit codes `0` and `10`–`14`; command and GitHub failures use `sysexits.h` codes — [docs/exit-codes.md](docs/exit-codes.md).

## Workflow Assumptions

This system is opinionated and works best with PRs that use required status checks and conversation resolution.

- Human-authored threads are replied to, not resolved or minimized by Shepherd.
- Detected bots and configured `botUsernames` review threads are returned until resolved; bot/non-human threads, PR comments, and review summaries can be resolved or minimized when eligible. Review summaries are not minimized while known inline child threads from that review remain unresolved.
- Agents must not reply to their own latest thread reply; generated instructions call this out before `--reply-thread-ids` mutations.
- Every review thread/comment/review summary is surfaced at least once, even if already outdated, resolved, or minimized; edited items re-surface through seen markers.
- Draft PRs can be marked ready automatically when clean; disable with `actions.autoMarkReady: false` or `--no-auto-mark-ready`.
- The CLI never performs git mutations. It emits instructions; the caller commits, rebases, pushes, and handles repository hooks.
- `build_suggestion_patch` turns one GitHub suggestion thread into a patch and commit metadata, but never edits the working tree or git history.

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

MCP clients call `iterate` once per tick, then use `apply` for review/file/journal mutations and `build_suggestion_patch` for an anchored suggestion. `iterate` returns the same structured action data as the CLI, including its review mutation arguments. The client owns recurrence, so this works consistently in Codex, Claude Code, Grok, and any other stdio MCP client.

The CLI remains useful for shell workflows. Its canonical polling form is:

```sh
pr-shepherd 42                         # poll until non-WAIT or timeout
pr-shepherd 42 --interval 60s --timeout 270s
pr-shepherd 42 --quiet-status          # print only changed WAIT status snapshots
pr-shepherd 42 --until-terminal        # continue through WAIT/MARK_READY until work or terminal state
pr-shepherd 42 --debounce 5m           # wait 5m after first FIX_CODE, then return one batched tick
pr-shepherd 42 --ready-delay 15m
pr-shepherd iterate 42                 # single tick
```

### Apply Review, File, And Journal Changes

Use `apply` with ordered operations to reply/resolve/minimize/dismiss review items, mark changed files viewed, or append an idempotent Shepherd Journal item. Use `build_suggestion_patch` to turn one review suggestion into a validated patch and commit metadata; it never changes the worktree or git history.

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
    - merge_group
actions:
  autoMinimizeSuppressed: true
  autoMarkReady: false
  neverCancelRuns:
    - "Final Code Review"
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

`suppress: true` hides the item from agent output. `autoResolve: true` queues it for the minimize/resolve mutation. When both apply together, Shepherd performs that mutation silently during `iterate` by default (`actions.autoMinimizeSuppressed: true`) so repetitive bot noise does not create a `fix_code` handoff.

TypeScript rules are loaded by the runtime's native TypeScript support; keep them to erasable syntax such as type annotations and `import type`. Runtime TypeScript features that need transpilation, such as enums, namespaces, parameter properties, and decorators, are not supported. Use `.mts` for portable ESM rules across Node, Bun, and Deno.

Ready-to-use examples for common patterns are in [`examples/classification/`](examples/classification/).

## CLI aliases

`poll`, `resolve`, `commit-suggestion`, `mark-files-as-viewed`, `journal`, `clean`, and `log-file` are CLI aliases. Prefer default polling/`iterate` in a shell and the MCP `iterate`, `apply`, and `build_suggestion_patch` tools in an agent client.

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
