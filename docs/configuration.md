# pr-shepherd configuration

[← README](../README.md)

pr-shepherd looks for a `.pr-shepherdrc.yml` file starting from the current working directory and walking up to `$HOME`. The first file found wins. All fields are optional — built-in defaults apply when omitted.

## Example

```yaml
# Post-fix commands run after Claude edits files (before commit).
postFixCommands:
  - npx oxlint --fix
  - npx oxfmt

# Commit message used when fixing review comments.
commitMessage: 'fix: address review comments'

# Base branch to rebase onto. null = auto-detect from PR (recommended).
baseBranch: null

# Aggressively minimize bot comments.
minimizeBots: true

# Cancel stale CI runs when actionable failures exist.
cancelCiOnFailure: true

# Cache TTL in seconds (default 5 minutes).
cache:
  ttlSeconds: 300

iterate:
  cooldownSeconds: 30   # wait after a commit before checking CI
  maxFixAttempts: 3     # attempts before escalating a thread

watch:
  intervalDefault: 4m           # /loop cadence
  readyDelayMinutesDefault: 10  # settle window after first READY
  expiresHoursDefault: 8        # max loop lifetime
  maxTurns: 50

resolve:
  concurrency: 4         # parallel GraphQL mutations
  shaPollIntervalMs: 2000
  shaPollMaxAttempts: 10

checks:
  relevantEvents:
    - pull_request
    - pull_request_target
  timeoutPatterns:
    - cancel timeout
    - exceeded the maximum execution time
    - job was cancelled
  infraPatterns:
    - runner error
    - service unavailable
    - ETIMEOUT
    - ECONNRESET
    - lost communication with the server
    - the hosted runner lost connection
  logLinesKept: 50
  logExcerptMaxChars: 3000
```

## `postFixCommands`

A list of shell commands run sequentially by `pr-shepherd postfix` after Claude edits files. Each command is split on whitespace and executed without a shell — no pipes or redirects. If any command fails, `pr-shepherd postfix` exits with a non-zero status and the commit is not made.

Default: `[]` (no-op).

## `commitMessage`

The commit message used when `fix_code` commits changes. Default: `'fix: address review comments'`.

## `baseBranch`

Force a specific base branch for rebases. When `null` (default), pr-shepherd detects it from `gh pr view --json baseRefName`.

## Environment variable overrides

| Variable | Effect |
| --- | --- |
| `PR_SHEPHERD_CACHE_DIR` | Override the cache base directory (default `$TMPDIR/pr-shepherd-cache`) |
| `PR_SHEPHERD_CACHE_TTL_SECONDS` | Override the cache TTL in seconds |
