# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools, including Claude Code and Codex.

The goal is to help an agent carry a planned change to a human-reviewable PR: passing CI, no unresolved Shepherd-visible work, and a useful PR description/journal.

## How It Works

`pr-shepherd` moves deterministic PR orchestration into a CLI. The CLI fetches GitHub state, emits raw-enough context, and prints a numbered `## Instructions` section for the calling agent to follow. The agent still decides whether a comment or CI failure requires a code change.

The shipped skills invoke the default poll dispatcher (`pr-shepherd <PR>`, equivalent to `pr-shepherd poll <PR>`). Use `pr-shepherd iterate <PR>` for one single tick.

Each tick returns exactly one action:

- `WAIT` — no immediate action; poll can recheck until timeout.
- `MARK_READY` — the CLI already converted an eligible draft PR to ready for review.
- `FIX_CODE` — review items, failing CI, conflicts, or minimization work need agent action.
- `CANCEL` — terminal success for merged/closed PRs or elapsed ready-delay.
- `ESCALATE` — manual direction is needed.

Example shape:

```text
> pr-shepherd 123

# PR #123 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice)

> The variable name is misleading.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)` [conclusion: FAILURE]
  > oxfmt

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` and `## Failing checks` whether a code change is warranted. If code changes are needed, apply edits, commit, rebase/push according to the repository's conventions, then run the `resolve:` command.
2. For each failing check under `## Failing checks`: fetch logs when needed and decide whether to rerun or fix.
3. Run the `resolve:` command shown above with a specific `$DISMISS_MESSAGE` and the relevant `$HEAD_SHA`.
4. Stop this iteration.
```

See [docs/actions.md](docs/actions.md) for the complete output contract.

## Workflow Assumptions

This system is opinionated and works best with PRs that use required status checks and conversation resolution.

- Human-authored threads are replied to, not resolved or minimized by Shepherd.
- Detected bots and configured `botUsernames` review threads are returned until resolved; bot/non-human threads, PR comments, and review summaries can be resolved or minimized when eligible. Review summaries are not minimized while known inline child threads from that review remain unresolved.
- Agents must not reply to their own latest thread reply; generated instructions call this out before `--reply-thread-ids` mutations.
- Every review thread/comment/review summary is surfaced at least once, even if already outdated, resolved, or minimized; edited items re-surface through seen markers.
- Draft PRs can be marked ready automatically when clean; disable with `actions.autoMarkReady: false` or `--no-auto-mark-ready`.
- The CLI never performs git mutations. It emits instructions; the caller commits, rebases, pushes, and handles repository hooks.
- `commit-suggestion` turns one GitHub suggestion thread into a patch and commit instructions, but still does not edit the working tree or git history.

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

Direct CLI:

```sh
pr-shepherd 42                         # poll until non-WAIT or timeout
pr-shepherd 42 --interval 45s --timeout 4m
pr-shepherd 42 --quiet-status          # print only changed WAIT status snapshots
pr-shepherd 42 --ready-delay 15m
pr-shepherd iterate 42                 # single tick
pr-shepherd poll 42                    # explicit poll command
```

### Resolve Review Items

```sh
pr-shepherd resolve 42 --reply-thread-ids PRRT_abc --message "Renamed the variable for clarity." --require-sha "$(git rev-parse HEAD)"
```

Use `pr-shepherd iterate 42` or `pr-shepherd 42` to fetch the next PR action. `resolve` requires at least one action flag and only applies explicit review-state mutations.

### Apply One Suggestion Thread

```sh
pr-shepherd commit-suggestion 42 --thread-id PRRT_abc --message "rename value for clarity"
```

The output contains a diff and numbered instructions for applying, staging, committing, resolving, and pushing.

### Mark Files As Viewed

```sh
pr-shepherd mark-files-as-viewed 42 --tests
pr-shepherd mark-files-as-viewed 42 src/a.ts --match '^docs/'
```

The shipped `mark-files-as-viewed` skill maps a standalone `tests` argument to `--tests`.

### Clean Local State

`pr-shepherd` stores seen markers, fix-attempt counters, stall fingerprints, ready-delay markers, and logs under `$PR_SHEPHERD_STATE_DIR` (default `$TMPDIR/pr-shepherd-state`).

```sh
pr-shepherd clean current
pr-shepherd clean repo
pr-shepherd clean all --dry-run
pr-shepherd log-file
```

## Install

Skill and plugin install methods add the skill definitions only. Install the `pr-shepherd` CLI separately wherever the skill runs.

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

## Configuration

Create `.pr-shepherdrc.yml` in your project root or an ancestor directory.

```yaml
iterate:
  fixAttemptsPerThread: 5
  stallTimeoutMinutes: 60
  minimizeApprovals: false
  minimizeComments: all # all | bots | users | none
checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target
    - merge_group
actions:
  autoMarkReady: false
```

Environment variables:

- `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` for auth; `gh auth token` is used as a fallback.
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

`suppress: true` hides the item from agent output. `autoResolve: true` queues it for the minimize/resolve mutation. Both can apply together.

Ready-to-use examples for common patterns are in [`examples/classification/`](examples/classification/).

## Requirements

- Node.js >= 22.0.0
- A GitHub token or authenticated `gh` CLI; private repositories require `repo` scope.
- `git`

## Docs

Full reference: [docs/README.md](docs/README.md).

## License

[MIT](LICENSE)
