/* eslint-disable max-lines */
import { LOG_FILE_USAGE } from "./help-log-file-page.mts";
import { DEFAULT_USAGE, ITERATE_USAGE, STACK_USAGE } from "./help-iterate-poll-pages.mts";

export const COMMAND_USAGE = {
  default: DEFAULT_USAGE,
  "apply merge": `pr-shepherd apply merge

Submit one SHA-guarded asynchronous merge or enqueue request with REST.
Rerun the same command to resume its persisted UUID. Pending and enqueued requests are not merged.
An enqueued result records that request's outcome; it does not confirm current queue membership.
An uncertain submission is never repeated automatically.

Usage:
  pr-shepherd apply merge [PR] --require-sha SHA --merge-action direct_merge|merge_queue|default
    [--method merge|squash|rebase] [--expected-stack JSON] --transport rest [--format text|json]

--require-sha <sha>             Full 40-character lowercase PR head SHA.
--merge-action <action>         direct_merge, merge_queue, or default.
--method <method>               Optional merge method, only for direct_merge.
--expected-stack <json>         Bind native stack number, baseRefName, and ordered prefix PRs/refs/head SHAs.
--transport rest               Required REST transport; repository rules are never bypassed.
--format text|json              Output format. Default: text.
--help, -h                     Print this help before validation or I/O.`,
  apply: `pr-shepherd apply

Apply review mutations, mark selected changed files as viewed, append a PR journal item, or record an external check blocker.

Usage:
  pr-shepherd apply merge [PR] --require-sha SHA --merge-action ACTION --transport rest
  pr-shepherd apply review [PR] [review-flags]
  pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
  pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd apply journal [PR] --file <path> [--dry-run] [--format text|json]
  pr-shepherd apply check-blocker [PR] --check <name> --blocked-by <ref>
  pr-shepherd apply check-blocker [PR] --check <name> --clear
  pr-shepherd apply queue-removal [PR] --require-sha <head> --queue-commit <commit> --removed-at <unix>

Run 'pr-shepherd apply <merge|review|files|journal|check-blocker|queue-removal> --help' for command-specific details.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "apply review": `pr-shepherd apply review

Apply user-directed GitHub review-state mutations after fixes. Supplied IDs are forwarded to GitHub;
GitHub accepts or rejects each mutation.

Usage:
  pr-shepherd apply review [PR] --reply-thread-ids A,B --message MSG
  pr-shepherd apply review [PR] --resolve-thread-ids A,B [--minimize-comment-ids X,Y]
                                  [--dismiss-review-ids Q] [--message MSG]
                                  [--require-sha SHA] [--format text|json]

Flags:
  --resolve-thread-ids <ids>      Comma-separated review thread IDs (PRRT_*) to resolve.
  --reply-thread-ids <ids>        Comma-separated review thread IDs to reply to.
  --minimize-comment-ids <ids>    Comma-separated issue/review comment IDs to minimize.
  --dismiss-review-ids <ids>      Comma-separated review IDs to dismiss.
  --message <text>                Reply/dismiss message. Required with reply or dismiss IDs.
  --require-sha <sha>             Wait for this full 40-character lowercase PR head SHA, or HEAD
                                  for this checkout's commit.
  --adopt-existing-replies        Generated durable-state commands only: count a thread whose last
                                  comment is already this exact Shepherd reply from you as replied
                                  instead of posting it again. Omit it to forward every reply ID.
  --format text|json              Output format. Default: text.

At least one action flag is required.
--help, -h                      Print this help and exit before GitHub I/O.`,

  "apply files": `pr-shepherd apply files

Mark selected changed files as viewed.

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

  "apply check-blocker": `pr-shepherd apply check-blocker

Record that a failing check is blocked on an external pull request or issue, or clear that record.
While the blocker is open, iterate waits instead of treating that check as agent work.

Usage:
  pr-shepherd apply check-blocker [PR] --check <name> --blocked-by <ref> [--format text|json]
  pr-shepherd apply check-blocker [PR] --check <name> --clear [--format text|json]

\`--check\` is the exact check name. \`--blocked-by\` accepts:
  https://github.com/owner/repo/pull/N
  https://github.com/owner/repo/issues/N
  owner/repo#N
  issue:owner/repo#N

\`--clear\` removes that check's record and leaves other checks alone.
--help, -h                      Print this help and exit before any I/O.`,

  "apply queue-removal": `pr-shepherd apply queue-removal

Acknowledge one current CI-driven merge-queue removal for a native-stack PR.
This writes local state only after a fresh GitHub read confirms the supplied head,
queue commit, and removal timestamp still identify the current removal.

Usage:
  pr-shepherd apply queue-removal [PR] --require-sha <head> --queue-commit <commit> --removed-at <unix>

--require-sha <sha>       Full 40-character lowercase PR head SHA observed with the failure.
--queue-commit <sha>      Full 40-character lowercase synthetic merge-group commit SHA.
--removed-at <unix>       Removal time in Unix seconds.
--format text|json        Output format. Default: text.
--help, -h                Print this help and exit before any I/O.`,

  suggest: `pr-shepherd suggest

Build an ordered list of patches and commit instructions from GitHub review suggestions.
The command does not edit files or mutate git history.

Usage:
  pr-shepherd suggest [PR]
    --thread-id ID --message MSG [--description DESC]
    [--thread-id ID --message MSG [--description DESC] ...]
    [--format text|json]

Each --thread-id starts a suggestion group. Its following --message and optional --description
belong to that suggestion. Groups are validated and returned in command-line order.

The current branch must match the PR head ref. Local HEAD may equal or descend from the PR head;
every generated patch is dry-run in order with git apply --check before output.
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
When CLAUDE_CODE_REMOTE=true, state is the durable copy under the git common directory.
--help, -h                      Print this help and exit before any cleanup.`,

  "admin log-file": LOG_FILE_USAGE,

  iterate: ITERATE_USAGE,

  stack: STACK_USAGE,

  "journal extract": `pr-shepherd journal extract

Extract one visible, structurally valid Shepherd Journal from a local PR-body file.
This command performs no GitHub, configuration, or log I/O.

Usage:
  pr-shepherd journal extract --body-file <path>

The output is exactly one JSON line: the typed result from extractShepherdJournal.
Malformed or unrecognized journal content is returned as {"ok":false,...} with exit code 0.
On POSIX, the final body-file path entry must be a readable regular file in a trusted parent directory;
symlinks, FIFOs, devices, and unreadable paths exit 66. Unsupported platforms fail closed with exit 66.
--help, -h                      Print this help and exit before any I/O.`,

  playbook: `pr-shepherd playbook

Print a playbook named by a playbook pointer in the output's ## Instructions. Playbooks ship with the
package, so this works without the pr-shepherd skill installed. With no name, lists every playbook.
This command performs no GitHub, git, or log I/O.

Usage:
  pr-shepherd playbook [name] [--format text|json]

Flags:
  --format text|json   Markdown text (default) or one JSON line: {"name","content"} or {"playbooks":[...]}.

The name is case-insensitive; spaces and hyphens are equivalent ("Triage loop" and triage-loop match).
Unknown names exit 64 and list the available playbooks.
--help, -h                      Print this help and exit before any I/O.`,
} as const;
