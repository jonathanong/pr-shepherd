import type {
  EscalateDetails,
  ReviewThread,
  PrComment,
  Review,
  TriagedCheck,
} from "../../types.mts";
import { loadConfig } from "../../config/load.mts";
import { toAgentThread, toAgentComment } from "../../reporters/agent.mts";

export interface EscalateCheck {
  triggers: string[];
  thrashHistory?: EscalateDetails["attemptHistory"];
}

export function checkEscalateTriggers(
  actionableThreads: ReviewThread[],
  actionableComments: PrComment[],
  changesRequestedReviews: Review[],
  actionableChecks: TriagedCheck[],
  threadAttempts: Record<string, number>,
  hasConflicts: boolean,
): EscalateCheck {
  const triggers: string[] = [];
  const maxAttempts = loadConfig().iterate.fixAttemptsPerThread;

  // Trigger 1: fix thrash — same thread dispatched too many times without resolving.
  const thrashThreads = actionableThreads.filter((t) => (threadAttempts[t.id] ?? 0) >= maxAttempts);
  if (thrashThreads.length > 0) {
    triggers.push("fix-thrash");
  }

  // Trigger 2: PR-level CHANGES_REQUESTED with no inline threads/comments/CI to act on.
  // Skip when there are merge conflicts — fix_code handles conflict resolution, not escalation.
  if (
    changesRequestedReviews.length > 0 &&
    actionableThreads.length === 0 &&
    actionableComments.length === 0 &&
    actionableChecks.length === 0 &&
    !hasConflicts
  ) {
    triggers.push("pr-level-changes-requested");
  }

  // Trigger 3: actionable thread has no file/line — cannot locate code to edit.
  const unlocatable = actionableThreads.filter((t) => t.path === null || t.line === null);
  if (unlocatable.length > 0) {
    triggers.push("thread-missing-location");
  }

  return {
    triggers,
    thrashHistory:
      thrashThreads.length > 0
        ? thrashThreads.map((t) => ({ threadId: t.id, attempts: threadAttempts[t.id] ?? 0 }))
        : undefined,
  };
}

export interface BaseBranchLookup {
  branch: string;
  /** True when we could not confirm the branch name from GitHub. Callers must
   * escalate rather than emitting a rebase against a potentially-wrong base. */
  isFallback: boolean;
  /** Populated when `isFallback`; one-line reason shown in escalate output. */
  failureReason?: string;
}

/**
 * Validate the base branch name from the GraphQL batch (`report.baseBranch`)
 * and fall back safely if it's missing/unsafe. The branch is interpolated into
 * shell commands by `buildRebaseShellScript` and `buildFixInstructions`, so we
 * reject anything outside `[A-Za-z0-9._/-]` to prevent shell injection.
 */
export function validateBaseBranch(raw: string): BaseBranchLookup {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {
      branch: "main",
      isFallback: true,
      failureReason: "GraphQL batch returned an empty base branch name",
    };
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    return {
      branch: "main",
      isFallback: true,
      failureReason: `base branch ${JSON.stringify(trimmed)} contains unsafe characters`,
    };
  }
  return { branch: trimmed, isFallback: false };
}

export function buildRebaseShellScript(baseBranch: string): string {
  return [
    `if ! git diff --quiet || ! git diff --cached --quiet; then`,
    `  echo "SKIP rebase: dirty worktree (uncommitted changes present)"`,
    `  exit 1`,
    `fi`,
    `git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease`,
  ].join("\n");
}

export function buildEscalateHumanMessage(
  escalate: Omit<EscalateDetails, "humanMessage">,
  pr: number,
): string {
  const lines: string[] = [];
  lines.push("⚠️  /pr-shepherd:monitor paused — needs human direction");
  lines.push("");
  lines.push(`**Triggers:** ${escalate.triggers.map((t) => `\`${t}\``).join(", ")}`);
  lines.push("");
  lines.push(escalate.suggestion);

  const hasItems =
    escalate.unresolvedThreads.length > 0 ||
    escalate.changesRequestedReviews.length > 0 ||
    escalate.ambiguousComments.length > 0;
  if (hasItems) {
    lines.push("");
    lines.push("## Items needing attention");
    for (const t of escalate.unresolvedThreads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      const firstLine = t.body.split("\n")[0] ?? "";
      lines.push(`- thread \`${t.id}\` — ${loc} (@${t.author}): ${firstLine}`);
    }
    for (const r of escalate.changesRequestedReviews) {
      const firstLine = r.body.split("\n")[0] ?? "";
      lines.push(`- review \`${r.id}\` (@${r.author}): ${firstLine}`);
    }
    for (const c of escalate.ambiguousComments) {
      const firstLine = c.body.split("\n")[0] ?? "";
      lines.push(`- comment \`${c.id}\` (@${c.author}): ${firstLine}`);
    }
  }

  if (escalate.attemptHistory && escalate.attemptHistory.length > 0) {
    lines.push("");
    lines.push("## Fix attempts");
    for (const a of escalate.attemptHistory) {
      lines.push(`- thread \`${a.threadId}\` attempted ${a.attempts} times`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`Run \`/pr-shepherd:check ${pr}\` to see current state.`);
  lines.push(`After fixing manually, rerun \`/pr-shepherd:monitor ${pr}\` to resume.`);
  return lines.join("\n");
}

export function buildEscalateSuggestion(triggers: string[], detail?: string): string {
  if (triggers.includes("stall-timeout")) {
    const mins = detail ?? "30";
    return `No progress detected for ${mins} minute${parseInt(mins, 10) === 1 ? "" : "s"} — state has not changed. Inspect the PR and resume manually once the blocking issue is resolved.`;
  }
  if (triggers.includes("base-branch-unknown")) {
    const reason = detail ? ` (${detail})` : "";
    return `Could not determine the PR's base branch${reason} — refusing to emit a rebase that could force-push onto the wrong base. Run the rebase manually against the PR's real target branch.`;
  }
  if (triggers.includes("fix-thrash")) {
    return "Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor";
  }
  if (triggers.includes("pr-level-changes-requested")) {
    return "Reviewer requested changes but left no inline comments — read the review and act manually";
  }
  if (triggers.includes("thread-missing-location")) {
    return "Review thread has no file/line reference — cannot locate code to edit automatically";
  }
  return "Ambiguous state — inspect the PR and act manually";
}

// Re-export for use in stall.mts without circular dependency through the barrel.
export { toAgentThread, toAgentComment };
