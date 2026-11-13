# shepherd exit codes

[← README](../README.md)

This page lists every process exit code `pr-shepherd` returns, for scripts and agents that branch on `$?`. Codes `0` and `10`–`16` mean Shepherd gathered context and chose an action (the process-level counterpart of the action tag in [actions.md](actions.md)); `64` and above mean the command itself failed.

## The rule

```text
$? == 0          shepherd finished and the PR is in a good terminal state
$? in 10..19     shepherd ran fine; the code reports PR state (mostly non-terminal)
$? >= 64         shepherd itself failed (BSD sysexits.h)
```

Codes 10–19 sit below the `sysexits.h` block, so "shepherd is reporting PR state" never collides with "shepherd broke". A script only needs `[ "$?" -ge 64 ]` to detect a failure.

A host that runs Shepherd as a background command may report any non-zero exit, including `10`–`16`, as a failed command. Read the output: these are Shepherd actions, not crashes.

## 0 — done

| Code | `action` / `reason`                   |
| ---- | ------------------------------------- |
| 0    | `cancel` / `merged`                   |
| 0    | `cancel` / `ready-delay-elapsed`      |
| 0    | `cancel` / `auto-mark-ready-disabled` |

POSIX has one success code, so clean finishes share it. The `reason` field distinguishes them in text and JSON.

## 10–19 — PR state

Emitted by `iterate`, the default `pr-shepherd [PR]`, and the aggregate commands once a report was fetched. The code names the result's `action`.

| Code | Action          | Meaning                                                              | Terminal? |
| ---- | --------------- | -------------------------------------------------------------------- | --------- |
| 10   | `wait`, `ready` | Nothing to do yet, or a clean PR whose ready-delay is still counting | No        |
| 11   | `mark_ready`    | Draft PR was converted to ready for review                           | No        |
| 12   | `triage`        | Agent work required — see the printed instructions                   | No        |
| 13   | `escalate`      | Human attention required                                             | Yes       |
| 14   | `cancel`        | PR closed without merging (`reason: "closed"`)                       | Yes       |
| 15   | `merge`         | Run the emitted merge or merge-queue command                         | No        |
| 16   | `shepherd`      | Run the listed one-PR sessions, then recheck the stack               | No        |

- **`wait` and `ready` (10) are not errors and not a signal to give up.** `wait` means nothing is actionable right now, including when `poll --timeout` gives up mid-wait and prints the last `wait` tick. `ready` means the PR is clean with `remainingSeconds` of ready-delay left; `--until-terminal` returns it instead of sleeping through the countdown. A script that asks "is the PR done?" should treat 10 like 12/13/16: not finished. Only `0` is a successful terminal state.
- `mark_ready` (11) is non-terminal. `pr-shepherd [PR]` stops on it by default; `--until-terminal` keeps polling through it.
- `triage` (12) is always non-terminal: complete the printed work, then repeat the same CLI command (or schedule another MCP `iterate` tick).
- `shepherd` (16) is stack-level and non-terminal: complete the listed one-PR sessions and rerun the same `stack` command. A mixed stack may surface human blockers on this tick; it returns `escalate` only once no shepherdable session remains.
- `escalate` (13) is the only human handoff.

**Aggregate commands.** Explicit multi-PR polling returns the highest-priority row outcome, in this order: `escalate`, `triage`, `merge`, `mark_ready`, `wait`, closed-only `cancel`, then successful `cancel`. Native `stack` maps its `nextAction` directly:

| Stack `nextAction` | Exit | When                                                                                                                                                                                    |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shepherd`         | 16   | Autonomous one-PR work remains                                                                                                                                                          |
| `wait`             | 10   | Queue progress                                                                                                                                                                          |
| `merge`            | 15   | A ready prefix can merge                                                                                                                                                                |
| `cancel`           | 0    | Ready layers are complete, only clean drafts remain under disabled auto mark-ready (row reason `draft-auto-mark-ready-disabled`), or all layers merged. Any closed layer makes it `14`. |
| `escalate`         | 13   | A human decision remains with no autonomous one-PR work                                                                                                                                 |

The full row list prints regardless of the aggregate action.

## 64–78 — shepherd failed (`sysexits.h`)

Standard BSD `sysexits.h` codes (`/usr/include/sysexits.h`), uniform across every subcommand: `iterate`, `apply`, `suggest`, and the `admin` commands.

| Code | Name             | When                                                                                                                                                                                                                                                                                |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64   | `EX_USAGE`       | Bad or unknown flag, unknown subcommand, missing required argument, invalid `--format`, malformed duration                                                                                                                                                                          |
| 65   | `EX_DATAERR`     | Malformed caller data: `--require-sha` neither `HEAD` nor a 40-char lowercase hex SHA, `PRRC_*` comment IDs passed to `--minimize-comment-ids`, an unparseable `owner/repo` string                                                                                                  |
| 66   | `EX_NOINPUT`     | `apply journal --file` path could not be read (including `--file -` for stdin), or `journal extract --body-file` could not safely read a regular POSIX body file                                                                                                                    |
| 69   | `EX_UNAVAILABLE` | A precondition is unmet: no open PR for the current branch; a suggestion thread is resolved, outdated, minimized, unanchored, unsafe, or not applyable to the local descendant; GitHub returned an unclassified 4xx; or an explicit review mutation returned a non-rate-limit error |
| 70   | `EX_SOFTWARE`    | Unexpected or unclassified internal failure — the fallback                                                                                                                                                                                                                          |
| 75   | `EX_TEMPFAIL`    | A **retryable** GitHub failure: HTTP 429, any 5xx, a `Retry-After` header, an exhausted rate limit, a GraphQL `INTERNAL` engine crash (HTTP 200 with `data: null`), or a GraphQL resource-limit error (`Resource limits for this query exceeded`)                                   |
| 77   | `EX_NOPERM`      | GitHub 401/403 that is not a rate-limit signal — missing token or insufficient PAT scopes                                                                                                                                                                                           |
| 78   | `EX_CONFIG`      | Invalid config: an unknown or pre-v1 key, a bad value, a YAML syntax error, or more than one config file in one directory. The message names the file and key path.                                                                                                                 |

**75 vs. 77 vs. 69** is the split that matters most to a caller: `75` means back off and retry; `77` means fix the token, its scopes, or session access; `69` means the request cannot proceed no matter how often it is retried.

### Special cases

| Situation                                                                                          | Code | Notes                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST snapshot keeps changing during bounded reconciliation                                         | 75   | The PR revision moved, or CCR thread and inline-comment memberships still disagree after a retry. No incomplete snapshot is returned.                                                                                                               |
| Cloud proxy session-access refusal during review mutations                                         | 77   | Prints the proxy message; repair session repository access and retry. No GitHub-denied marker is persisted for the item.                                                                                                                            |
| Explicit `--transport graphql` (or `github.transport: graphql`) inside a Claude Code cloud session | 77   | The proxy answers every GraphQL request with 403 `GitHub GraphQL is not available from Claude Code sessions`. Rerun with `--transport rest` or `--transport auto`; there is no token to fix. `auto` (the default) switches to REST on that refusal. |
| `apply review` with one or more failed operations                                                  | 69   | `75` when the result reports a rate-limit stop. The complete result still prints.                                                                                                                                                                   |

`suggest` and `admin` commands never emit 10–19 PR-state codes. They exit `0` on success and a `sysexits.h` code on failure; each command's `--help` lists the codes it can realistically hit. `apply merge` reports its status: `pending` exits `10`; `failed` exits `75` when `uncertain`, else `69`; any other status exits `0`.

### How GitHub errors are classified

`GitHubRequestError` classifies itself at construction time (via `classifyStatus`; `errorToExitCode` only reads back the carried code), in this order:

1. **Retry signal → 75.** `Retry-After`, a secondary-limit message, `429`, `5xx`, an exhausted rate limit, a GraphQL `INTERNAL` error, or a GraphQL resource-limit error. This runs before the 401/403 rule because GitHub's secondary rate limit also returns 403, sometimes without `Retry-After` but with a secondary-limit message.
2. **GraphQL permission failure at HTTP 200 → 77.** A fine-grained PAT missing a scope for one field (e.g. `statusCheckRollup`) still gets 200 with that field's error in `errors[]`. `graphqlErrors[].message` matching `/resource not accessible/i` maps to `77` instead of `69`.
3. **Status-only rule.** 401/403 → `77`; other unclassified 4xx → `69`.

A malformed GraphQL response (wrong shape, a null node where one is required) is neither a permission nor a precondition problem; those call sites pass `exitCodeOverride: EXIT.SOFTWARE` (70).

**GraphQL engine crashes** arrive at HTTP 200 with `data: null` and `Something went wrong while executing your query … Please include <id> when reporting this issue.`, sometimes with `errors[].type` or `errors[].extensions.code` set to `INTERNAL` (checked independently). Retrying the same query often succeeds, so they map to `75`.

- The GraphQL client retries read operations twice (500ms, then 1500ms) before surfacing the failure. The same retry covers `Resource limits for this query exceeded` (message, `type`, or `extensions.code` `RESOURCE_LIMITS_EXCEEDED`), even with partial `data`.
- A `stack` summary that still hits the resource limit halves `entries(first:)` down to 1 and pages with `after`; a failing one-entry page surfaces `75` with GitHub's message.
- Mutations are never retried: a retry after GitHub applied a write (`addPullRequestReviewThreadReply`, mark-ready) would duplicate the side effect.
- A response that also carries `Retry-After` or an exhausted rate limit skips the short delays and surfaces `75` immediately.

## `--help` / `-h`

Every subcommand's `--help`/`-h` short-circuits before any I/O and exits `0`. See the "Help flags" section of the project `AGENTS.md`.

## Where this is implemented

| Symbol                            | File                               | Role                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXIT`                            | `src/exit-codes.mts`               | The constant map of every code above.                                                                                                                                                                 |
| `ShepherdError`                   | `src/exit-codes.mts`               | `Error` subclass that carries its own exit code.                                                                                                                                                      |
| `iterateResultToExitCode(result)` | `src/exit-codes.mts`               | Maps an `IterateResult` (`action`, plus `reason` for `cancel`) to 0 or 10–15. Called from `src/cli/iterate-emitter.mts`, which backs `iterate` and `pr-shepherd [PR]`.                                |
| `pollSummaryExitCode(result)`     | `src/cli/poll-summary-emitter.mts` | Maps a `PollSummaryResult` (`nextAction` for `stack`, else the highest-priority row) to 0 or 10–16.                                                                                                   |
| `applyReviewResultToExitCode`     | `src/exit-codes.mts`               | `apply review`: `77` on a session refusal, `75`/`69` on errors, else `0`.                                                                                                                             |
| `errorToExitCode(err)`            | `src/exit-codes.mts`               | A thrown `ShepherdError`'s code, or `EX_SOFTWARE` (70). Called from the top-level `.catch()` in `src/index.mts` and handlers that report a caught error directly (`admin log-file`, `apply journal`). |
| `GitHubRequestError`              | `src/github/errors.mts`            | Extends `ShepherdError`; classifies itself from HTTP status, rate-limit headers, and `Retry-After`, so every GraphQL and REST call site is classified without special-casing.                         |
