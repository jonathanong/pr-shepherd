import { hasFlag } from "./args.mts";

export const USAGE = {
  top:
    "Usage:\n" +
    "  pr-shepherd --version | -v\n" +
    "  pr-shepherd [PR] [--format text|json] [--ready-delay Nm]\n" +
    "                 [--stall-timeout <duration>] [--no-auto-mark-ready]\n" +
    "                 [--no-auto-cancel-actionable]\n" +
    "  pr-shepherd resolve [PR] [--fetch] [--resolve-thread-ids A,B] [--minimize-comment-ids X,Y]\n" +
    "                           [--dismiss-review-ids Q] [--message MSG] [--require-sha SHA]\n" +
    "  pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [--description DESC]\n" +
    "                                     [--dry-run] [--format text|json]\n" +
    "  pr-shepherd iterate [PR] [--format text|json] [--ready-delay Nm]\n" +
    "                             [--stall-timeout <duration>] [--no-auto-mark-ready]\n" +
    "                             [--no-auto-cancel-actionable]\n" +
    "  pr-shepherd poll [PR] [--interval 30s] [--timeout 5m] [--format text|json] [--ready-delay Nm]\n" +
    "                        [--stall-timeout <duration>] [--no-auto-mark-ready]\n" +
    "                        [--no-auto-cancel-actionable]\n" +
    "  pr-shepherd clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]\n" +
    "  pr-shepherd log-file [--format text|json]",

  resolve:
    "Usage: pr-shepherd resolve [PR] [--fetch] [--resolve-thread-ids A,B]\n" +
    "                               [--minimize-comment-ids X,Y] [--dismiss-review-ids Q]\n" +
    "                               [--message MSG] [--require-sha SHA]",

  "commit-suggestion":
    "Usage: pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG\n" +
    "                                          [--description DESC] [--format text|json]",

  iterate:
    "Usage: pr-shepherd iterate [PR] [--format text|json] [--ready-delay Nm]\n" +
    "                                [--stall-timeout <duration>] [--no-auto-mark-ready]\n" +
    "                                [--no-auto-cancel-actionable]",

  poll:
    "Usage: pr-shepherd poll [PR] [--interval 30s] [--timeout 5m] [--format text|json]\n" +
    "                             [--ready-delay Nm] [--stall-timeout <duration>]\n" +
    "                             [--no-auto-mark-ready] [--no-auto-cancel-actionable]",

  clean:
    "Usage: pr-shepherd clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]",

  "log-file": "Usage: pr-shepherd log-file [--format text|json]",
} as const;

/** Prints usage for `key` to stdout and returns true if `--help` or `-h` is in args. */
export function maybePrintHelp(args: string[], key: keyof typeof USAGE): boolean {
  if (!hasFlag(args, "--help") && !hasFlag(args, "-h")) return false;
  process.stdout.write(`${USAGE[key]}\n`);
  return true;
}
