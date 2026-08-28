interface ShellCommand {
  argv: string[];
}

export interface MergeCommandPlan {
  mode: "auto" | "queue";
  command: ShellCommand;
  /** Ordinary merge retry without `--auto`, used only when auto-merge is unavailable. */
  fallbackCommand?: ShellCommand;
  /** Direct enqueuePullRequest fallback for the known gh CLI queue limitation. */
  queueApiFallbackCommand?: ShellCommand;
}
