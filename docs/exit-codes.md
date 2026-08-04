# shepherd exit codes

[← README](../README.md)

## The rule

```
$? == 0          shepherd finished and the PR is in a good terminal state
$? in 10..19     shepherd ran fine; the code reports non-terminal PR state
$? >= 64         shepherd itself failed (BSD sysexits.h)
```

One check tells a caller whether to treat the exit code as PR state or as a
crash:

```sh
pr-shepherd 42
code=$?
if [ "$code" -ge 64 ]; then
  echo "shepherd failed — see stderr" >&2
  exit "$code"
fi
# code is 0 or 10-19 here — a real PR outcome, not an error
```

This replaces the old scheme, where `fix_code` and every command/validation
error both exited `1` — callers had to grep stdout for a `# PR #$N [ACTION]`
heading to tell them apart. Under the new scheme the _range_ of the exit code
already answers that question, so no heading-sniffing is needed.

## 0 — done

| Code | `action` / `reason`              |
| ---- | -------------------------------- |
| 0    | `cancel` / `merged`              |
| 0    | `cancel` / `ready-delay-elapsed` |

POSIX gives exactly one success code, so shepherd's two "finished cleanly"
outcomes share it. The `reason` field still distinguishes them in both text
output (`[CANCEL] — merged`) and JSON (`"reason": "merged"`).

## 10–19 — PR state

Emitted by `iterate` and `poll` (including the default `pr-shepherd [PR]`
invocation) once a report was fetched successfully. The code names the
`action` field of the `IterateResult`.

| Code | Action       | Meaning                                            |
| ---- | ------------ | -------------------------------------------------- |
| 10   | `wait`       | Nothing to do yet; CI still in progress            |
| 11   | `mark_ready` | Draft PR was converted to ready for review         |
| 12   | `fix_code`   | Agent work required — see the printed instructions |
| 13   | `escalate`   | Human attention required                           |
| 14   | `cancel`     | PR closed without merging (`reason: "closed"`)     |

**`wait` (10) is not an error, and it is not a signal to give up.** It means
"nothing actionable right now" — including when `poll --timeout` gives up
mid-wait and prints the last `wait` tick. A `set -e` shell script or CI step
that only wants to know "is the PR fully done" should treat `wait` (10) the
same way it treats `escalate`/`fix_code` (12/13): not finished yet. Only `0`
means the PR reached a terminal, successful state.

`mark_ready` (11) is also non-terminal — the PR is still open and iterating
continues on the next tick. `poll` stops on it by default; pass
`--until-terminal` to keep polling through it.

Codes 10–19 are chosen so they sit strictly above the small single-digit
range and strictly below the `sysexits.h` block that starts at 64 — there is
no ambiguity between "shepherd is telling you about the PR" and "shepherd
broke."

## 64–78 — shepherd failed (`sysexits.h`)

These are the standard BSD `sysexits.h` codes
(`/usr/include/sysexits.h`), reused rather than invented, so the numbers mean
the same thing they do everywhere else on the system. Emitted by every
subcommand, not just `iterate`/`poll` — this range is uniform across `resolve`,
`commit-suggestion`, `mark-files-as-viewed`, `clean`, and `journal` too.

| Code | Name             | When                                                                                                                                                                       |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64   | `EX_USAGE`       | Bad or unknown flag, unknown subcommand, missing required argument, invalid `--format`, malformed duration                                                                 |
| 65   | `EX_DATAERR`     | Malformed caller data: `--require-sha` not a 40-char lowercase hex SHA, `PRRC_*` comment IDs passed to `--minimize-comment-ids`, an unparseable `owner/repo` string        |
| 66   | `EX_NOINPUT`     | `journal --file` path could not be read (including `--file -` for stdin)                                                                                                   |
| 69   | `EX_UNAVAILABLE` | A precondition is unmet: no open PR for the current branch, a `commit-suggestion` thread is resolved/outdated/minimized/unanchored, or GitHub returned an unclassified 4xx |
| 70   | `EX_SOFTWARE`    | Unexpected or unclassified internal failure — the fallback when nothing more specific applies                                                                              |
| 75   | `EX_TEMPFAIL`    | A **retryable** GitHub failure: HTTP 429, any 5xx, a `Retry-After` header, or an exhausted rate limit                                                                      |
| 77   | `EX_NOPERM`      | GitHub 401/403 that is not a rate-limit signal — missing token or insufficient PAT scopes                                                                                  |
| 78   | `EX_CONFIG`      | Reserved for `.pr-shepherdrc.yml` validation failures. **Not currently emitted** — see below.                                                                              |

**Reading 75 vs. 77 vs. 69:** these are the highest-value split in the error
range for a calling agent or script. `75` means back off and retry (GitHub is
throttling or briefly unavailable); `77` means fix the token or its scopes;
`69` means the request itself can't proceed no matter how many times it's
retried (there's no PR to act on, or the target thread isn't eligible).

**GitHub 403 is ambiguous on its own** — GitHub's secondary rate limit also
returns 403, with a `Retry-After` header. `errorToExitCode` checks for a retry
signal (`Retry-After`, `429`, `5xx`, or an exhausted rate limit) _before_
falling back to the blanket 401/403 → `77` rule, so a throttled 403 correctly
resolves to `75`, not `77`.

**GraphQL permission failures often arrive at HTTP 200, not 401/403.** A
fine-grained PAT missing a scope for one field (e.g. `statusCheckRollup`)
still gets a 200 response with the field's error listed in `errors[]` —
GitHub only fails the one field, not the whole request. Status-only
classification would misclassify this as `69` (`EX_UNAVAILABLE`, "nothing to
act on") instead of `77` (`EX_NOPERM`, "fix your token"). `GitHubRequestError`
also checks `graphqlErrors[].message` against `/resource not accessible/i` —
the literal string GitHub uses for this failure — before falling back to the
status-only rule. A malformed/unparseable GraphQL response (wrong shape, a
null node where one is required) is a third, distinct case: it isn't a
permission or precondition problem either, so those call sites pass an
explicit `exitCodeOverride: EXIT.SOFTWARE` to `GitHubRequestError` rather than
letting status-based classification guess.

**78 (`EX_CONFIG`) is defined but not wired up.** A malformed
`.pr-shepherdrc.yml` currently degrades gracefully: shepherd logs a
`failed to parse` warning to stderr and falls back to built-in defaults rather
than failing the run. That fallback is intentional, tested behavior, and this
change does not alter it. The code is reserved in case a future change makes
config validation fatal.

**`resolve`, `commit-suggestion`, `mark-files-as-viewed`, `clean`, and
`journal` never emit 0/10–19** — those codes are specific to `IterateResult`.
These commands exit `0` on success and a `sysexits.h` code on failure. See
each command's `--help` for which codes it can realistically hit.

## `--help` / `-h`

Every subcommand's `--help`/`-h` short-circuits before any I/O and exits `0`.
See the "Help flags" section of the project `CLAUDE.md`.

## Migrating from the old scheme

| Old | Old meaning                                     | New                                                                                                                  |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0   | `wait` or `mark_ready`                          | `10` (`wait`) or `11` (`mark_ready`) — no longer `0`                                                                 |
| 1   | `fix_code`, **or** any command/validation error | `12` (`fix_code`) if a report was fetched; a `sysexits.h` code (64–78) if shepherd failed before or during the fetch |
| 2   | `cancel` (any reason)                           | `0` (`merged` or `ready-delay-elapsed`) or `14` (`closed`)                                                           |
| 3   | `escalate`                                      | `13`                                                                                                                 |

The old scheme's worst problem — exit `1` meaning either "agent has work to
do" or "the CLI itself broke" — no longer exists. If you previously branched
on `$? -eq 1` to mean `fix_code`, branch on `$? -eq 12` instead; if you
branched on it to detect a failure, branch on `$? -ge 64`.

## Where this is implemented

`src/exit-codes.mts` defines the `EXIT` constant map, the `ShepherdError`
class (an `Error` subclass that carries its own exit code), and the two
functions that decide what gets returned:

- `iterateResultToExitCode(result)` — maps an `IterateResult` (keying on
  `action`, and `reason` for `cancel`) to 0 or 10–19. Called from
  `src/cli/iterate-emitter.mts`, which backs `iterate`, `poll`, and the
  default `pr-shepherd [PR]` invocation.
- `errorToExitCode(err)` — returns a thrown `ShepherdError`'s carried code, or
  `EX_SOFTWARE` (70) for anything else. Called from the top-level `.catch()`
  in `src/index.mts`, and from any handler that reports a caught error's code
  directly (e.g. `log-file`, `journal`).

`GitHubRequestError` (`src/github/errors.mts`) extends `ShepherdError` and
classifies itself from the HTTP status, rate-limit headers, and
`Retry-After` at construction time, so every GraphQL and REST call site gets
correct classification for free without special-casing each throw.
