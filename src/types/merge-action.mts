interface ShellCommand {
  argv: string[];
}

export interface MergeCommandPlan {
  mode: "auto" | "queue" | "rest";
  command: ShellCommand;
  /** Ordinary merge retry without `--auto`, used only when auto-merge is unavailable. */
  fallbackCommand?: ShellCommand;
  /** Direct enqueuePullRequest fallback for the known gh CLI queue limitation. */
  queueApiFallbackCommand?: ShellCommand;
  /**
   * GraphQL-mode commands (`gh pr merge`, `gh api graphql`) all spend GraphQL quota. This REST
   * equivalent is for when that quota is exhausted: `gh api` PUT for an ordinary merge, or
   * `apply merge --transport rest` for a queue.
   */
  restFallbackCommand?: ShellCommand;
  /**
   * gh's 24h HTTP cache holds a stale GraphQL rate-limit error that makes `gh pr merge` fail while
   * Shepherd's live GraphQL quota is healthy. Present only when found; delete `paths` first.
   */
  ghCacheStaleRateLimit?: { paths: string[]; expiresAt: string };
}
