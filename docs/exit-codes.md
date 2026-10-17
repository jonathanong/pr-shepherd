# shepherd exit codes

[← README](../README.md)

This page lists every process exit code `pr-shepherd` returns, for scripts and agents that branch on `$?`. Codes `0` and `10`–`16` mean Shepherd gathered context and chose an action (the process-level counterpart of the action tag in [actions.md](actions.md)); `64` and above mean the command itself failed.

## The rule

```text
$? == 0          shepherd finished and the PR is in a good terminal state
$? in 10..19     shepherd ran fine; the code reports non-terminal PR state
$? >= 64         shepherd itself failed (BSD sysexits.h)
```

```sh
pr-shepherd 42
code=$?
if [ "$code" -ge 64 ]; then
  echo "shepherd failed — see stderr" >&2
  exit "$code"
fi
# code is 0 or 10-19 here — a real PR outcome, not an error
```

Codes 10–19 sit above the single-digit range and below the `sysexits.h` block, so "shepherd is reporting PR state" never collides with "shepherd broke".

## 0 — done

| Code | `action` / `reason`              |
| ---- | -------------------------------- |
| 0    | `cancel` / `merged`              |
| 0    | `cancel` / `ready-delay-elapsed` |

POSIX has one success code, so both clean finishes share it. The `reason` field distinguishes them in text (`[CANCEL] — merged`) and JSON (`"reason": "merged"`).

## 10–19 — PR state

Emitted by `iterate` and `poll` (including the default `pr-shepherd [PR]`) once a report was fetched. The code names the result's `action`.

| Code | Action          | Meaning                                                              | Terminal? |
| ---- | --------------- | -------------------------------------------------------------------- | --------- |
| 10   | `wait`, `ready` | Nothing to do yet, or a clean PR whose ready-delay is still counting | No        |
| 11   | `mark_ready`    | Draft PR was converted to ready for review                           | No        |
| 12   | `fix_code`      | Agent work required — see the printed instructions                   | No        |
| 13   | `escalate`      | Human attention required                                             | Yes       |
| 14   | `cancel`        | PR closed without merging (`reason: "closed"`)                       | Yes       |
| 15   | `merge`         | Run the emitted merge or merge-queue command                         | No        |
| 16   | `shepherd`      | Run the listed one-PR sessions, then recheck the stack               | No        |

- **`wait` and `ready` (10) are not errors and not a signal to give up.** `wait` means nothing is actionable right now, including when `poll --timeout` gives up mid-wait and prints the last `wait` tick. `ready` means the PR is clean with `remainingSeconds` of ready-delay left; `--until-terminal` returns it instead of sleeping through the countdown. A `set -e` script that asks "is the PR done?" should treat 10 like 12/13/16: not finished. Only `0` is a successful terminal state.
- `mark_ready` (11) is non-terminal. `poll` stops on it by default; `--until-terminal` keeps polling through it.
- `fix_code` (12) is always non-terminal: complete the printed work, then repeat the same CLI command (or schedule another MCP `iterate` tick).
- `shepherd` (16) is stack-level and non-terminal: complete the listed one-PR sessions and rerun the same `--stack` selector. A mixed stack may surface human blockers on this tick; it returns `escalate` only once no shepherdable session remains.
- `escalate` (13) is the only human handoff.

**Aggregate selectors.** Explicit multi-PR polling returns the highest-priority row outcome, in this order: `escalate`, `fix_code`, `merge`, `mark_ready`, `wait`, closed-only `cancel`, then successful `cancel`. Native `--stack` returns `shepherd` (16) for autonomous one-PR work, `wait` (10) for queue progress, `cancel` (0) for completed readiness, and `escalate` (13) only when a human decision remains with no autonomous one-PR work. The full row list prints regardless of the aggregate action.

## 64–78 — shepherd failed (`sysexits.h`)

Standard BSD `sysexits.h` codes (`/usr/include/sysexits.h`), uniform across every subcommand: `iterate`, `apply`, `build-suggestion-patches`, and the `admin` commands.

| Code | Name             | When                                                                                                                                                                                                                                                                                |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64   | `EX_USAGE`       | Bad or unknown flag, unknown subcommand, missing required argument, invalid `--format`, malformed duration                                                                                                                                                                          |
| 65   | `EX_DATAERR`     | Malformed caller data: `--require-sha` neither `HEAD` nor a 40-char lowercase hex SHA, `PRRC_*` comment IDs passed to `--minimize-comment-ids`, an unparseable `owner/repo` string                                                                                                  |
| 66   | `EX_NOINPUT`     | `apply journal --file` path could not be read (including `--file -` for stdin), or `journal extract --body-file` could not safely read a regular POSIX body file                                                                                                                    |
| 69   | `EX_UNAVAILABLE` | A precondition is unmet: no open PR for the current branch; a suggestion thread is resolved, outdated, minimized, unanchored, unsafe, or not applyable to the local descendant; GitHub returned an unclassified 4xx; or an explicit review mutation returned a non-rate-limit error |
| 70   | `EX_SOFTWARE`    | Unexpected or unclassified internal failure — the fallback                                                                                                                                                                                                                          |
| 75   | `EX_TEMPFAIL`    | A **retryable** GitHub failure: HTTP 429, any 5xx, a `Retry-After` header, an exhausted rate limit, a GraphQL `INTERNAL` engine crash (HTTP 200 with `data: null`), or a GraphQL resource-limit error (`Resource limits for this query exceeded`)                                   |
| 77   | `EX_NOPERM`      | GitHub 401/403 that is not a rate-limit signal — missing token or insufficient PAT scopes                                                                                                                                                                                           |
| 78   | `EX_CONFIG`      | Reserved for `.pr-shepherdrc.yml` validation failures. **Not currently emitted.**                                                                                                                                                                                                   |

**75 vs. 77 vs. 69** is the split that matters most to a caller: `75` means back off and retry; `77` means fix the token, its scopes, or session access; `69` means the request cannot proceed no matter how often it is retried.

### Special cases

| Situation                                                                                          | Code | Notes                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST snapshot keeps changing during bounded reconciliation                                         | 75   | The PR revision moved, or CCR thread and inline-comment memberships still disagree after a retry. No incomplete snapshot is returned.                                                                                                               |
| Cloud proxy session-access refusal during review mutations                                         | 77   | Prints the proxy message; repair session repository access and retry. No GitHub-denied marker is persisted for the item.                                                                                                                            |
| Explicit `--transport graphql` (or `github.transport: graphql`) inside a Claude Code cloud session | 77   | The proxy answers every GraphQL request with 403 `GitHub GraphQL is not available from Claude Code sessions`. Rerun with `--transport rest` or `--transport auto`; there is no token to fix. `auto` (the default) switches to REST on that refusal. |
| `apply review` with one or more failed operations                                                  | 69   | `75` when the result reports a rate-limit stop. The complete result still prints.                                                                                                                                                                   |
| Malformed `.pr-shepherdrc.yml`                                                                     | —    | Not fatal: logs a `failed to parse` warning to stderr and falls back to built-in defaults (intentional, tested). `78` is reserved in case this becomes fatal.                                                                                       |

`apply`, `build-suggestion-patches`, and `admin` commands never emit 0/10–19 PR-state codes — those are specific to `IterateResult`. They exit `0` on success and a `sysexits.h` code on failure; each command's `--help` lists the codes it can realistically hit.

### How GitHub errors are classified

`GitHubRequestError` classifies itself at construction time (via `classifyStatus`; `errorToExitCode` only reads back the carried code), in this order:

1. **Retry signal → 75.** `Retry-After`, a secondary-limit message, `429`, `5xx`, an exhausted rate limit, a GraphQL `INTERNAL` error, or a GraphQL resource-limit error. This runs before the 401/403 rule because GitHub's secondary rate limit also returns 403, sometimes without `Retry-After` but with a secondary-limit message.
2. **GraphQL permission failure at HTTP 200 → 77.** A fine-grained PAT missing a scope for one field (e.g. `statusCheckRollup`) still gets 200 with that field's error in `errors[]`. `graphqlErrors[].message` matching `/resource not accessible/i` maps to `77` instead of `69`.
3. **Status-only rule.** 401/403 → `77`; other unclassified 4xx → `69`.

A malformed GraphQL response (wrong shape, a null node where one is required) is neither a permission nor a precondition problem; those call sites pass `exitCodeOverride: EXIT.SOFTWARE` (70).

**GraphQL engine crashes** arrive at HTTP 200 with `data: null` and `Something went wrong while executing your query … Please include <id> when reporting this issue.`, sometimes with `errors[].type` or `errors[].extensions.code` set to `INTERNAL` (checked independently — a nonempty non-`INTERNAL` `type` does not hide `extensions.code`). Retrying the same query often succeeds, so they map to `75`.

- The GraphQL client retries read operations twice (500ms, then 1500ms) before surfacing the failure. The same retry covers `Resource limits for this query exceeded` (message, `type`, or `extensions.code` `RESOURCE_LIMITS_EXCEEDED`), even with partial `data`.
- A `--stack` summary that still hits the resource limit halves `entries(first:)` down to 1 and pages with `after`; a failing one-entry page surfaces `75` with GitHub's message.
- Mutations are never retried: an INTERNAL or resource-limit error after GitHub applied a write (`addPullRequestReviewThreadReply`, mark-ready) would duplicate the side effect.
- A response that also carries `Retry-After` or an exhausted rate limit skips the short delays and surfaces `75` immediately.
- The GraphQL layer keeps `type` and `extensions` on `graphqlErrors` so classification can use them.

## `--help` / `-h`

Every subcommand's `--help`/`-h` short-circuits before any I/O and exits `0`. See the "Help flags" section of the project `AGENTS.md`.

## Where this is implemented

| Symbol                            | File                    | Role                                                                                                                                                                                      |
| --------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXIT`                            | `src/exit-codes.mts`    | The constant map of every code above.                                                                                                                                                     |
| `ShepherdError`                   | `src/exit-codes.mts`    | `Error` subclass that carries its own exit code.                                                                                                                                          |
| `iterateResultToExitCode(result)` | `src/exit-codes.mts`    | Maps an `IterateResult` (`action`, plus `reason` for `cancel`) to 0 or 10–19. Called from `src/cli/iterate-emitter.mts`, which backs `iterate`, `poll`, and `pr-shepherd [PR]`.           |
| `applyReviewResultToExitCode`     | `src/exit-codes.mts`    | `apply review`: `77` on a session refusal, `75`/`69` on errors, else `0`.                                                                                                                 |
| `errorToExitCode(err)`            | `src/exit-codes.mts`    | A thrown `ShepherdError`'s code, or `EX_SOFTWARE` (70). Called from the top-level `.catch()` in `src/index.mts` and handlers that report a caught error directly (`log-file`, `journal`). |
| `GitHubRequestError`              | `src/github/errors.mts` | Extends `ShepherdError`; classifies itself from HTTP status, rate-limit headers, and `Retry-After`, so every GraphQL and REST call site is classified without special-casing.             |
