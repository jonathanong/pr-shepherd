import { LOG_FILE_USAGE } from "./help-log-file-page.mts";
import { ITERATE_USAGE, POLL_USAGE } from "./help-iterate-poll-pages.mts";

export const COMMAND_USAGE = {
  resolve: `pr-shepherd resolve

Apply GitHub review-state mutations after fixes.

Usage:
  pr-shepherd resolve [PR] --reply-thread-ids A,B --message MSG
  pr-shepherd resolve [PR] --resolve-thread-ids A,B [--minimize-comment-ids X,Y]
                            [--dismiss-review-ids Q] [--message MSG]
                            [--require-sha SHA] [--format text|json]

Flags:
  --resolve-thread-ids <ids>      Comma-separated review thread IDs (PRRT_*) to resolve.
                                  Human-authored thread IDs are skipped; use --reply-thread-ids.
                                  Note: comment IDs (PRRC_*) from gh api are not thread IDs and will fail.
  --reply-thread-ids <ids>        Comma-separated human review thread IDs to reply to.
  --minimize-comment-ids <ids>    Comma-separated issue/review comment IDs to minimize.
  --dismiss-review-ids <ids>      Comma-separated CHANGES_REQUESTED review IDs to dismiss.
  --message <text>                Reply/dismiss message. Required with --reply-thread-ids
                                  or --dismiss-review-ids.
  --require-sha <sha>             Wait until GitHub reports this PR head SHA before mutating.
                                  Must be a full 40-character lowercase hex SHA. Use $(git rev-parse HEAD).
  --format text|json              Output format. Default: text.
  --help, -h                      Print this help and exit before GitHub I/O.

At least one non-empty action flag is required:
  --reply-thread-ids, --resolve-thread-ids, --minimize-comment-ids, or --dismiss-review-ids.

PR may be a number or GitHub pull request URL. When omitted, the current branch PR is inferred.
Exit code: 0 on success; nonzero on failure (sysexits.h — see docs/exit-codes.md).`,

  "commit-suggestion": `pr-shepherd commit-suggestion

Build a patch and commit instructions for one GitHub review thread containing a suggestion block.
The command does not edit files or mutate git history.

Usage:
  pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG
                                      [--description DESC] [--format text|json]

Flags:
  --thread-id <id>       Review thread ID containing exactly one suggestion to apply. Required.
  --message <text>       Suggested commit subject. Required and must be non-empty.
  --description <text>   Optional longer commit body.
  --format text|json     Output format. Default: text.
  --help, -h             Print this help and exit before GitHub, git, config, or log I/O.

Preconditions:
  The current branch must match the PR head ref, and local HEAD must match the PR head SHA.

Exit codes:
  0   suggestion patch and instructions produced
  64  usage error (missing/invalid flag)
  69  precondition unmet (thread ineligible, branch/SHA mismatch, no open PR)
  See docs/exit-codes.md for the full sysexits.h table.`,

  "mark-files-as-viewed": `pr-shepherd mark-files-as-viewed

Mark changed files as viewed in the GitHub pull request diff.

Usage:
  pr-shepherd mark-files-as-viewed [PR] [files...] [--tests] [--match REGEX]
                                      [--format text|json]

Selectors:
  files...          Exact changed-file paths from the PR diff.
  --tests           Select changed test files.
  --match <regex>   Select changed files whose paths match a case-insensitive JavaScript regex.
                    May be repeated.

Flags:
  --format text|json  Output format. Default: text.
  --help, -h          Print this help and exit before GitHub I/O.

PR may be a number or GitHub pull request URL. When omitted, the current branch PR is inferred.
Exit code: 0 on success; nonzero on failure (sysexits.h — see docs/exit-codes.md).`,

  iterate: ITERATE_USAGE,

  poll: POLL_USAGE,

  clean: `pr-shepherd clean

Remove pr-shepherd state files from PR_SHEPHERD_STATE_DIR.

Usage:
  pr-shepherd clean pr [number] [--dry-run] [--format text|json]
  pr-shepherd clean branch [name] [--dry-run] [--format text|json]
  pr-shepherd clean current [--dry-run] [--format text|json]
  pr-shepherd clean repo [--dry-run] [--format text|json]
  pr-shepherd clean all [--dry-run] [--format text|json]

Variants:
  pr [number]          Remove state for one PR. Defaults to current branch PR.
  branch [name]        Resolve a branch to its open PR, then remove that PR's state.
                       Defaults to current branch.
  current              Alias for branch against the current branch.
  repo                 Remove all state for the current repository, including worktree logs.
  all                  Remove all pr-shepherd state.

Flags:
  --dry-run            Preview paths without removing them.
  --format text|json   Output format. Default: text.
  --help, -h           Print this help and exit before any cleanup.

Exit code: 0 on success (including a no-op --dry-run on a nonexistent target); nonzero on failure (sysexits.h — see docs/exit-codes.md).`,

  journal: `pr-shepherd journal

Append a list item to the ## Shepherd Journal section of a PR body.
Creates the section at the end if absent. Idempotent — duplicate items are skipped.

Usage:
  pr-shepherd journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd journal [PR] --file <path> [--dry-run] [--format text|json]
  pr-shepherd journal [PR] --file - [--dry-run] [--format text|json]

  PR     PR number or GitHub pull request URL. Defaults to current branch PR.
  item   Markdown list item: must start with "- " followed by non-whitespace text.
         Example: '- Rejected suggestion: kept existing pattern for consistency.'
         Provide it as a positional argument, or via --file to avoid shell-escaping
         backticks and multi-line Markdown. Exactly one of the two is required.

Flags:
  --file <path>        Read the entry from a file instead of a positional argument.
                        Pass --file - to read from stdin.
  --dry-run            Preview the new PR body without writing it to GitHub.
  --format text|json   Output format. Default: text.
  --help, -h           Print this help and exit before any GitHub I/O.

Exit code: 0 on success (including no-change no-op); nonzero on failure (sysexits.h — see docs/exit-codes.md).`,

  "log-file": LOG_FILE_USAGE,
} as const;
