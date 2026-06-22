export const LOG_FILE_USAGE = `pr-shepherd log-file

Print the per-worktree append-only debug log path for the current repository.
The log is created by the first non-help pr-shepherd command that initializes logging.

Usage:
  pr-shepherd log-file [--format text|json]

Flags:
  --format text|json   Print a raw path or {"path": "..."} JSON. Default: text.
  --help, -h           Print this help and exit before logging setup.

Environment:
  PR_SHEPHERD_LOG_DISABLED=1 disables logging.
  PR_SHEPHERD_STATE_DIR overrides the base state directory.

Exit code: 0 on success; 1 if repository identity cannot be resolved.`;
