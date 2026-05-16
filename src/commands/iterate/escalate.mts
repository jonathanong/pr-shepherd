import type {
  EscalateDetails,
  EscalateTrigger,
  ReviewThread,
} from "../../types.mts";
import { loadConfig } from "../../config/load.mts";

export interface EscalateCheck {
  triggers: EscalateTrigger[];
  thrashHistory?: EscalateDetails["thrashHistory"];
}

export function checkEscalateTriggers(
  actionableThreads: ReviewThread[],
  threadAttempts: Record<string, number>,
): EscalateCheck {
  const triggers: EscalateTrigger[] = [];
  const maxAttempts = loadConfig().iterate.fixAttemptsPerThread;

  // Trigger 1: fix thrash — same thread dispatched too many times without resolving.
  const thrashThreads = actionableThreads.filter((t) => (threadAttempts[t.id] ?? 0) >= maxAttempts);
  if (thrashThreads.length > 0) {
    triggers.push("fix-thrash");
  }

  // Trigger 2: actionable thread has no file/line — cannot locate code to edit.
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
 * shell commands by `buildFixInstructions`, so we reject anything outside
 * `[A-Za-z0-9._/-]` to prevent shell injection.
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

export function buildEscalateHumanMessage(
  escalate: Omit<EscalateDetails, "humanMessage">,
  pr: number,
): string {
  const lines: string[] = [];
  lines.push("⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required");
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
    lines.push("");
    for (const t of escalate.unresolvedThreads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      lines.push(`- thread \`${t.id}\` — ${loc} (@${t.author}):`);
      lines.push("");
      for (const bodyLine of t.body.split("\n")) lines.push(`  > ${bodyLine}`);
      lines.push("");
    }
    for (const r of escalate.changesRequestedReviews) {
      lines.push(`- review \`${r.id}\` (@${r.author}):`);
      lines.push("");
      for (const bodyLine of r.body.split("\n")) lines.push(`  > ${bodyLine}`);
      lines.push("");
    }
    for (const c of escalate.ambiguousComments) {
      lines.push(`- comment \`${c.id}\` (@${c.author}):`);
      lines.push("");
      for (const bodyLine of c.body.split("\n")) lines.push(`  > ${bodyLine}`);
      lines.push("");
    }
  }

  if (escalate.thrashHistory && escalate.thrashHistory.length > 0) {
    lines.push("");
    lines.push("## Fix attempts");
    lines.push("");
    for (const a of escalate.thrashHistory) {
      lines.push(`- thread \`${a.threadId}\` attempted ${a.attempts} times`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `After completing manual fixes (and pushing if required), rerun \`/pr-shepherd:pr-shepherd ${pr}\` to resume.`,
  );
  return lines.join("\n");
}

export function buildEscalateSuggestion(triggers: EscalateTrigger[], detail?: string): string {
  if (triggers.includes("stall-timeout")) {
    const mins = detail ?? "30";
    return `No progress detected for ${mins} minute${parseInt(mins, 10) === 1 ? "" : "s"} — state has not changed. This is a manual checkpoint: inspect the PR and apply a manual fix before resuming.`;
  }
  if (triggers.includes("base-branch-unknown")) {
    const reason = detail ? ` (${detail})` : "";
    return `Could not determine the PR's base branch${reason} — automated rebases are paused because branch safety is unclear. Run the rebase manually against the PR's real target branch.`;
  }
  if (triggers.includes("fix-thrash")) {
    return "Same thread(s) reached the automated attempt limit — treat this as a manual handoff. Apply the fix by hand.";
  }
  if (triggers.includes("thread-missing-location")) {
    return "Review thread has no file/line reference — automated location routing failed and manual handling is required.";
  }
  return "Ambiguous state — automated handling cannot proceed safely. Inspect the PR and act manually.";
}
