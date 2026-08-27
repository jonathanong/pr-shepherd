/* eslint-disable max-lines */
import { LOG_FILE_USAGE } from "./help-log-file-page.mts";
import { DEFAULT_USAGE, ITERATE_USAGE, POLL_USAGE } from "./help-iterate-poll-pages.mts";

export const COMMAND_USAGE = {
  default: DEFAULT_USAGE,
  apply: `pr-shepherd apply

Apply a review mutation, mark changed files as viewed, or append a PR journal item.

Usage:
  pr-shepherd apply review [PR] [review-flags]
  pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
  pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd apply journal [PR] --file <path> [--dry-run] [--format text|json]

Run 'pr-shepherd apply <review|files|journal> --help' for command-specific details.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "apply review": `pr-shepherd apply review

Apply GitHub review-state mutations after fixes.

Usage:
  pr-shepherd apply review [PR] --reply-thread-ids A,B --message MSG
  pr-shepherd apply review [PR] --resolve-thread-ids A,B [--minimize-comment-ids X,Y]
                                  [--dismiss-review-ids Q] [--message MSG]
                                  [--require-sha SHA] [--format text|json]

Flags:
  --resolve-thread-ids <ids>      Comma-separated review thread IDs (PRRT_*) to resolve.
                                  Human-authored thread IDs are skipped; use --reply-thread-ids.
  --reply-thread-ids <ids>        Comma-separated human review thread IDs to reply to.
  --minimize-comment-ids <ids>    Comma-separated issue/review comment IDs to minimize.
  --dismiss-review-ids <ids>      Comma-separated CHANGES_REQUESTED review IDs to dismiss.
  --message <text>                Reply/dismiss message. Required with reply or dismiss IDs.
  --require-sha <sha>             Wait for this full 40-character lowercase PR head SHA.
  --format text|json              Output format. Default: text.

At least one action flag is required.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "apply files": `pr-shepherd apply files

Mark changed files as viewed in the GitHub pull request diff.

Usage:
  pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
                              [--format text|json]

Selectors:
  files...          Exact changed-file paths from the PR diff.
  --tests           Select changed test files.
  --match <regex>   Select changed files whose paths match a case-insensitive JavaScript regex.
                    May be repeated.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "apply journal": `pr-shepherd apply journal

Append a list item to the Shepherd Journal details block of a PR body.

Usage:
  pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd apply journal [PR] --file <path> [--dry-run] [--format text|json]
  pr-shepherd apply journal [PR] --file - [--dry-run] [--format text|json]

PR may be a number or GitHub pull request URL. An item must start with '- ' followed by text.
Use --file to read an item from a file, or --file - to read it from stdin. Exactly one item source
is required. --dry-run previews the resulting body without writing it.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "build-suggestion-patches": `pr-shepherd build-suggestion-patches

Build an ordered list of patches and commit instructions from GitHub review suggestions.
The command does not edit files or mutate git history.

Usage:
  pr-shepherd build-suggestion-patches [PR]
    --thread-id ID --message MSG [--description DESC]
    [--thread-id ID --message MSG [--description DESC] ...]
    [--format text|json]

Each --thread-id starts a suggestion group. Its following --message and optional --description
belong to that suggestion. Groups are validated and returned in command-line order.

The current branch must match the PR head ref. Local HEAD may equal or descend from the PR head;
every generated patch is dry-run in order with git apply --check before output.
--help, -h                      Print this help and exit before GitHub, git, config, or log I/O.`,

  "build-suggestion-patch": `pr-shepherd build-suggestion-patch

Deprecated one-suggestion adapter. Use build-suggestion-patches.

Usage:
  pr-shepherd build-suggestion-patch [PR] --thread-id ID --message MSG
                                      [--description DESC] [--format text|json]

Flags:
  --thread-id <id>       Review thread containing exactly one suggestion block. Required.
  --message <text>       Suggested commit subject. Required and non-empty.
  --description <text>   Optional longer commit body.
  --format text|json     Output format. Default: text.

The current branch must match the PR head ref. Local HEAD may equal or descend from the PR head.
--help, -h                      Print this help and exit before GitHub, git, config, or log I/O.`,

  admin: `pr-shepherd admin

Administrative state and diagnostics commands.

Usage:
  pr-shepherd admin clean <pr|branch|current|repo|all> [value] [flags]
  pr-shepherd admin log-file [--format text|json]

Run 'pr-shepherd admin <clean|log-file> --help' for command-specific details.
--help, -h                      Print this help and exit before any I/O.`,

  "admin clean": `pr-shepherd admin clean

Remove pr-shepherd state files from PR_SHEPHERD_STATE_DIR.

Usage:
  pr-shepherd admin clean pr [number] [--dry-run] [--format text|json]
  pr-shepherd admin clean branch [name] [--dry-run] [--format text|json]
  pr-shepherd admin clean current [--dry-run] [--format text|json]
  pr-shepherd admin clean repo [--dry-run] [--format text|json]
  pr-shepherd admin clean all [--dry-run] [--format text|json]

Variants remove state for one PR, branch, current branch, repository, or all repositories.
Use --dry-run to preview paths without removing them.
--help, -h                      Print this help and exit before any cleanup.`,

  "admin log-file": LOG_FILE_USAGE.replaceAll("pr-shepherd log-file", "pr-shepherd admin log-file"),

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
  The current branch must match the PR head ref. Local HEAD may equal or descend from the PR head.

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

Append a list item to the Shepherd Journal details block of a PR body.
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
