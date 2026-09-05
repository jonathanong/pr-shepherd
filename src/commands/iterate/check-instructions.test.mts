/* eslint-disable max-lines */
import { describe, it, expect } from "vitest";
import type { AgentCheck, ResolveCommand } from "../../types.mts";
import {
  buildBehindBaseHintInstruction,
  buildFailingCheckInstructions,
  buildFixCompletionInstruction,
  buildRepeatedWorkflowBranchRecoveryInstructions,
  buildResolveCommandInstruction,
} from "./check-instructions.mts";

function resolveCommand(overrides: Partial<ResolveCommand>): ResolveCommand {
  return {
    argv: ["pr-shepherd", "apply", "review", "42"],
    requiresHeadSha: false,
    requiresDismissMessage: false,
    hasMutations: true,
    ...overrides,
  };
}

function check(overrides: Partial<AgentCheck>): AgentCheck {
  return {
    name: "check",
    runId: "123",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123",
    conclusion: "FAILURE",
    logExcerpt: "tests failed",
    ...overrides,
  };
}

describe("buildBehindBaseHintInstruction", () => {
  it("renders the hint when behind and configured", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", true)).toEqual([
      "The branch is behind PR base branch `main`. rebase --force-with-lease before pushing.",
    ]);
  });

  it("returns empty when not behind", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", false)).toEqual([]);
  });

  it("returns empty when the hint is empty", () => {
    expect(buildBehindBaseHintInstruction("main", "", true)).toEqual([]);
  });

  it("trims surrounding whitespace from the configured hint", () => {
    expect(buildBehindBaseHintInstruction("main", "  rebase  ", true)).toEqual([
      "The branch is behind PR base branch `main`. rebase before pushing.",
    ]);
  });

  it("treats a whitespace-only hint as unconfigured", () => {
    expect(buildBehindBaseHintInstruction("main", "   ", true)).toEqual([]);
  });

  it("treats a non-string hint from a malformed rc file as unconfigured", () => {
    // yaml parsing does not enforce the TS type at runtime (e.g. `behindBaseHint: true`).
    const malformed = true as unknown as string;
    expect(buildBehindBaseHintInstruction("main", malformed, true)).toEqual([]);
  });
});

describe("buildRepeatedWorkflowBranchRecoveryInstructions", () => {
  it("omits recovery guidance before a workflow rerun", () => {
    expect(
      buildRepeatedWorkflowBranchRecoveryInstructions("main", false, {
        isBehind: true,
        hasConflicts: false,
      }),
    ).toEqual([]);
  });

  it("builds behind-base recovery guidance for a later workflow attempt", () => {
    expect(
      buildRepeatedWorkflowBranchRecoveryInstructions("release/next", true, {
        isBehind: true,
        hasConflicts: false,
      }),
    ).toEqual([
      "The workflow rerun still fails while the branch is behind PR base branch `release/next`. Inspect the current base branch for an existing fix before choosing a remediation.",
      "Rebase or otherwise update the PR branch from `release/next` according to repository conventions.",
    ]);
  });

  it("builds conflict recovery guidance for a later workflow attempt", () => {
    expect(
      buildRepeatedWorkflowBranchRecoveryInstructions("main", true, {
        isBehind: false,
        hasConflicts: true,
      }),
    ).toEqual([
      "The workflow rerun still fails while the branch conflicts with PR base branch `main`. Inspect the current base branch for an existing fix before choosing a remediation.",
      "Rebase or otherwise update the PR branch from `main` according to repository conventions, resolving conflicts as part of that update.",
    ]);
  });
});

describe("buildFailingCheckInstructions", () => {
  it("returns nothing when there are no failing checks", () => {
    expect(buildFailingCheckInstructions([])).toEqual([]);
  });

  it("emits a single triage pointer for any GitHub Actions / external failure, plus bare-check preservation", () => {
    // Per-conclusion rerun mechanics (gh run view/rerun rules for CANCELLED,
    // STARTUP_FAILURE, external) are invariant text now covered by the pr-shepherd
    // skill's "CI failure triage" playbook — see the collision note on
    // buildFailingCheckInstructions in check-instructions.mts. Only the `(no runId)`
    // bare-check preservation stays here for mixed FIX_CODE ticks; when it is the only
    // blocker, handleFixCode promotes the whole result to ESCALATE.
    const instructions = buildFailingCheckInstructions([
      check({}),
      check({ runId: "124", conclusion: "CANCELLED" }),
      check({ runId: "125", conclusion: "STARTUP_FAILURE" }),
      check({ runId: null, detailsUrl: "https://ci.example/check" }),
      check({ runId: null, detailsUrl: null }),
    ]);

    expect(instructions).toEqual([
      'Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.',
      "For each `(no runId)` failure, preserve the displayed metadata; Shepherd will escalate when no other autonomous work remains.",
    ]);
  });

  it("emits only the bare-check preservation when every failure lacks a runId and a URL", () => {
    expect(buildFailingCheckInstructions([check({ runId: null, detailsUrl: null })])).toEqual([
      "For each `(no runId)` failure, preserve the displayed metadata; Shepherd will escalate when no other autonomous work remains.",
    ]);
  });

  it("adds a rerun pointer when a failing check carries an authorized rerun command", () => {
    const instructions = buildFailingCheckInstructions([
      check({
        conclusion: "CANCELLED",
        rerunCommand: "gh run rerun 124 -R owner/repo",
      }),
    ]);

    expect(instructions).toEqual([
      'Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.',
      'A `[rerun authorized]` check includes a `rerun:` command. See "CI failure triage" in the pr-shepherd skill for which conclusions warrant a rerun versus a code fix.',
    ]);
  });
});

describe("buildResolveCommandInstruction", () => {
  it("returns nothing when there are no mutations", () => {
    expect(buildResolveCommandInstruction(resolveCommand({ hasMutations: false }))).toEqual([]);
  });

  it("emits only the run-the-command step (plus pointer) when nothing else applies", () => {
    expect(buildResolveCommandInstruction(resolveCommand({}))).toEqual([
      'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.',
    ]);
  });

  it("puts the marker-routing explanation first when replyThreadIds is non-empty", () => {
    // The generated command already excludes marker-ended replies. Keep the explanation
    // CLI-side so callers know author equality is not the self-reply signal and must not
    // rewrite the generated viewer-authored reply-and-resolve pairing.
    expect(buildResolveCommandInstruction(resolveCommand({ replyThreadIds: ["PRRT_1"] }))).toEqual([
      "Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked thread that is still being resolved is emitted resolve-only, not for another reply.",
      'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.',
    ]);
  });

  it("omits the marker-routing explanation when replyThreadIds is empty", () => {
    const instructions = buildResolveCommandInstruction(resolveCommand({}));
    expect(instructions.some((i) => i.includes("remove any `--reply-thread-ids` entry"))).toBe(
      false,
    );
  });

  it("emits $HEAD_SHA and $DISMISS_MESSAGE substitution steps before the run-the-command step, in order", () => {
    expect(
      buildResolveCommandInstruction(
        resolveCommand({
          replyThreadIds: ["PRRT_1"],
          requiresHeadSha: true,
          requiresDismissMessage: true,
        }),
      ),
    ).toEqual([
      "Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked thread that is still being resolved is emitted resolve-only, not for another reply.",
      "If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.",
      "Replace `$DISMISS_MESSAGE` with one sentence describing what changed.",
      'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.',
    ]);
  });
});

describe("buildFixCompletionInstruction", () => {
  it("hands control back to the caller for the next tick", () => {
    expect(buildFixCompletionInstruction([check({})])).toBe(
      "`[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.",
    );
  });

  it("continues through a push before SHA-gated mutations", () => {
    expect(buildFixCompletionInstruction([check({})], false, true)).toBe(
      "`[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.",
    );
  });

  it("continues after conflict resolution and push", () => {
    expect(buildFixCompletionInstruction([], true)).toBe(
      "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push to the PR head branch, then iterate immediately with the same options.",
    );
  });

  it.each(["CANCELLED", "STARTUP_FAILURE"] as const)(
    "is non-terminal when a %s check carries an authorized rerun command",
    (conclusion) => {
      expect(
        buildFixCompletionInstruction([
          check({ conclusion, rerunCommand: "gh run rerun 124 -R owner/repo" }),
        ]),
      ).toBe(
        "`[FIX_CODE]` is non-terminal. Run any warranted reruns for `[rerun authorized]` checks (or apply code fixes for real failures), then iterate immediately with the same options to continue.",
      );
    },
  );

  it("prefers the SHA-gated instruction over an authorized rerun recommendation", () => {
    expect(
      buildFixCompletionInstruction(
        [check({ conclusion: "CANCELLED", rerunCommand: "gh run rerun 124 -R owner/repo" })],
        false,
        true,
      ),
    ).toContain("if you changed code, commit and push");
  });

  it.each([
    check({ runId: null, detailsUrl: null }),
    check({ conclusion: "ACTION_REQUIRED", logExcerpt: undefined }),
    check({ conclusion: "STARTUP_FAILURE", logExcerpt: undefined }),
  ])("never emits terminal handoff wording for a FIX_CODE completion", (value) => {
    const completion = buildFixCompletionInstruction([value]);
    expect(completion).toContain("`[FIX_CODE]` is non-terminal");
    expect(completion).not.toMatch(/hand[- ]?off|stop polling|human direction/i);
  });
});
