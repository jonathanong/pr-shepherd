# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools, including Claude Code and Codex.
The goal is to have an agent take a plan to a human-reviewable PR autonomously.

Example Workflow:

1. `/model opusplan`
2. Create a plan
3. Accept the plan
4. Switch to Auto Mode
5. Prompt: `make a PR, then run /pr-shepherd:pr-shepherd`
6. Agent makes a draft PR
7. PR has passing CI -> draft is marked Ready for Review
8. Review bots begin providing reviews
9. Agent automatically classifies and fixes review comments based on the Plan
10. Human reviews PR with a well-documented PR title and description, passing CI, and no open threads/comments/reviews

## How it works

`pr-shepherd` optimizes token management, rate limits, and agentic orchestration by moving **ALL** deterministic logic and prompts to code via a CLI tool, enshrining what would be a large skill or command prompt (of which the agent would inevitably make mistakes) into the code and returning a clear, actionable prompt.

The CLI emits unified recheck instructions. Generated commands call `pr-shepherd` directly.

At a high level, the skill invokes `pr-shepherd poll <PR>`, which provides actionable feedback directly to the agent:

```text
> pr-shepherd poll 123

# PR #123 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds` so readers don't have to
> trace back to the declaration to understand its meaning.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)`
  > oxfmt

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 123 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

_(schematic — actual steps depend on PR state)_

1. Apply code fixes for each file referenced under `## Review threads`.
2. For each failing check: examine the log tail to decide — rerun if transient, fix code if real.
3. Commit changed files.
4. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`.
5. Run the `resolve:` command above, substituting `"$HEAD_SHA"`.
6. Add or update a `## Shepherd Journal` section in the PR description for any large decisions made, appending under the existing heading if it already exists.
7. CI needs time to run on the new push. Run `pr-shepherd poll 123` again to continue until Shepherd returns `[CANCEL]` or `[ESCALATE]`.
```

On every iteration, a command is returned to instruct the agent exactly what to do. No guessing, no thinking, as few agentic turns as possible:

```text
pr-shepherd resolve 123 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"
```

## Workflow

This system makes opinionated decisions, which may or may not work for your team's workflow.

- The following PR branch protection rules are expected:
  - There are required status checks
  - All inline comments are resolved
- **ALL** comments/threads/reviews will be hidden by default except for PR approvals. The only option here is to hide PR approvals as well.
  - The primary reason is to optimize tokens by avoiding re-fetching comments and re-adding them to the agent's context.
  - This also ties hand-in-hand with requiring all inline comments to be resolved.
  - We also want to avoid storing state as comments can be unresolved/minimized/hidden.
- `pr-shepherd` keeps the PR title and description up to date, including a journal of decisions with links to comments/threads/reviews (that would be hidden at this point).
  - This may break your workflow if your PR titles and descriptions are restricted to a specific format.
- `pr-shepherd` does **NOT** reply to inline comments when resolving them. Doing so would require agentic loops and more tokens. Instead, it updates the PR title & description once per loop with only the relevant information.
- Branches are currently kept up-to-date with `git push --force-with-lease`. Please make a PR for making `merge <default branch>` an option.
- Branches are currently only rebased when 1) pushing a commit on a branch that is out of date or 2) there are merge conflicts. It does not continuously rebase the branch (use a merge queue for that).
- To optimize AI code reviewer tokens, create your pull requests initially as drafts and instruct your AI code reviewers to only code review PRs that are ready for review. `pr-shepherd` will automatically mark PRs as ready for review when all CI passes (can be disabled). If you have no intention of marking your PR as ready for review, then don't run `pr-shepherd`.

Some other workflow improvements:

- `pr-shepherd` knows whether a GitHub Copilot code review is in progress
- `pr-shepherd` waits 10 minutes (configurable) until after all comments are hidden and CI passes before exiting. The primary reason is to wait for any lingering automated code reviews that do not provide status updates via the GitHub GraphQL API.
- The agent is instructed to cancel failed CI runs and, when a failure looks transient (e.g. network timeout, runner setup crash), re-run them via `gh run rerun <id> --failed`. The primary reason is to minimize CI costs.
- `pr-shepherd` supports "commit suggestions" by converting them into a diff, applying them, and then committing them with attribution. This avoids a file read & write. One commit is always made per suggestion to avoid any merge conflicts — in these cases, the agent will resolve the comment manually.

Recommendations:

- Run `pr-shepherd` on all your PRs before you go to sleep so that you wake up to reviewable PRs. Keep an active goal cycling `pr-shepherd poll` until Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or `[ESCALATE]` (including `stall-timeout` for repeated unchanged CI failures).
- Instruct your agents to write comments in a single review (comment, changes requested, or approved). This allows the review's comments/threads to be minimized or resolved together, keeping your pull request history clean. If you write inline comments outside of a review, each comment would still show up in the pull request history and take up space.
- Avoid sticky comments as they will continue to be hidden. Instead, just make a new comment, especially on reviews. If you really want sticky comments, instruct your agent to unhide/unminimize them when updating them.
- Avoid having automation edit comments, reviews, or threads in place because updated items get minimized. Instead, always make a new review, comment, thread, etc.

## Design Principles

- **Reduced agent context and turns** — logic lives in the CLI, not the prompt. The relevant context is provided automatically to the agent, reducing tool calls.
- **Reduced GitHub rate-limit exposure** — GraphQL requests are batched when possible
- **Minimal state** — `pr-shepherd` stores minimal state in `$PR_SHEPHERD_STATE_DIR` (default `$TMPDIR/pr-shepherd-state/`), not in the repository
- **Classifications and decisions still happen at the agent level** — `pr-shepherd`'s goal is to provide sufficient context to make informed decisions and provide clear actionable steps without writing unreliable code-level heuristics
- **Configurable** — `pr-shepherd` is configurable via `.pr-shepherdrc.yml`, which is only possible with a light prompt that simply invokes the CLI which returns the prompt.

## Usage

### Iterate a PR to completion

Poll dispatcher — checks CI and review comments, fixes issues, and marks the PR ready for review when clean. Each non-terminal tick emits an `## Instructions` section; the skill follows it, then invokes `pr-shepherd poll` again until `[CANCEL]` or `[ESCALATE]`.

Claude Code (via `pr-shepherd` skill):

```
/pr-shepherd:pr-shepherd                  # infer PR from current branch
/pr-shepherd:pr-shepherd 42
/pr-shepherd:pr-shepherd 42 --ready-delay 15m
```

Codex or direct CLI:

```sh
pr-shepherd 42
pr-shepherd 42 --ready-delay 15m
pr-shepherd poll 42
pr-shepherd iterate 42               # legacy-compatible spelling
```

## Iterate decision loop

On each tick: fetch PR state in one GraphQL batch → classify CI, comments, and merge status → take one action (`fix_code`, `mark_ready`, `cancel`, `escalate`, or `wait`). See [docs/iterate-flow.md](docs/iterate-flow.md) for the decision table and [docs/flow.md](docs/flow.md) for the end-to-end flow diagram.

## Cleaning state

`pr-shepherd` accumulates state under `$PR_SHEPHERD_STATE_DIR` (seen markers, fix-attempt counters, stall fingerprints, etc.). To reset it:

```sh
pr-shepherd clean current    # remove state for the current branch's PR
pr-shepherd clean repo       # remove all state for this repo
pr-shepherd clean all        # remove all pr-shepherd state
```

Add `--dry-run` to preview what would be removed. See [docs/cli-usage.md](docs/cli-usage.md) for the full `clean` reference.

## Install

> **Note:** Skill and plugin install methods add the skill definitions only — they do not install the `pr-shepherd` CLI. Ensure `pr-shepherd` is available on `PATH` wherever the skill runs.

### Claude Code

Install as a Claude Code plugin:

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

This repo ships two `marketplace.json` files that serve different Claude install flows: the root `marketplace.json` resolves the published plugin (used by the `claude /plugin marketplace add` command above); `.claude-plugin/marketplace.json` is the owner-level registry manifest that resolves the plugin from the local plugin directory (used when Claude Code installs from a local or git-based source). Both files are needed to support these two install paths.

### Codex

Codex uses the repo-shipped Codex plugin rather than the Claude plugin or `/pr-shepherd:*` slash commands. The plugin provides one `pr-shepherd` skill for iterating a PR to completion.

Install the Codex plugin marketplace from GitHub:

```bash
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a branch/tag/ref:

```bash
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For local development, point Codex at a checkout:

```bash
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, open the Codex plugin directory, choose the `jonathanong` marketplace, and install/enable `pr-shepherd`. The marketplace root must contain `.agents/plugins/marketplace.json` and `plugins/pr-shepherd/`.

Install the CLI where Codex will run it so `pr-shepherd` is available on `PATH`. The plugin only installs the skill; it does not install the CLI into target repositories.

Iterate a PR from Codex:

```bash
pr-shepherd iterate 42
```

Or ask Codex to use the `pr-shepherd` skill, for example: `run pr-shepherd until this PR is ready`. Follow the output's `## Instructions`. Continue until Shepherd emits `[CANCEL]` or `[ESCALATE]` (including `stall-timeout` for repeated unchanged CI failures). `pr-shepherd iterate 42` remains supported for existing workflows.

## Configuration

Create a `.pr-shepherdrc.yml` in your project root (or any parent directory) to override defaults. The loader walks up from `cwd` to `$HOME` (if `$HOME` is on that path) or the filesystem root; the first match wins.

```yaml
iterate:
  fixAttemptsPerThread: 5 # raise before escalating to manual review
  minimizeComments: all # all | bots | users | none
checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target
    - merge_group # add for merge-queue repos
actions:
  autoMarkReady: false # disable to stay draft until you manually promote
```

Environment variables: `GH_TOKEN` / `GITHUB_TOKEN` (auth; falls back to `gh auth token`, then `GITHUB_PERSONAL_ACCESS_TOKEN`), `PR_SHEPHERD_STATE_DIR` (override loop-state and log base dir), `PR_SHEPHERD_LOG_DISABLED=1` (disable the per-worktree debug log).

See [docs/configuration.md](docs/configuration.md) for full semantics and deprecated-key migration.

## Requirements

- Node.js ≥ 22.0.0
- A GitHub token: set `GH_TOKEN` or `GITHUB_TOKEN`, **or** install and authenticate the `gh` CLI (`gh auth login`) — pr-shepherd uses `gh auth token` as a fallback before trying `GITHUB_PERSONAL_ACCESS_TOKEN`. The `repo` scope is required for private repositories.
- `git`

## Docs

Full reference: [docs/README.md](docs/README.md) — CLI usage, skills, configuration, architecture, actions, debugging, and more.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the module map and dependency rules.

## License

[MIT](LICENSE)
