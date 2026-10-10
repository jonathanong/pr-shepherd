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
  const BEHIND = { isBehind: true, hasConflicts: false };
  const CLEAN = { isBehind: false, hasConflicts: false };

  it("renders the hint when behind and configured", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", BEHIND)).toEqual([
      "The branch is behind PR base branch `main`. rebase --force-with-lease before pushing.",
    ]);
  });

  it("renders the hint when the branch conflicts with its base", () => {
    expect(
      buildBehindBaseHintInstruction("main", "rebase --force-with-lease", {
        isBehind: false,
        hasConflicts: true,
      }),
    ).toEqual([
      "The branch conflicts with PR base branch `main`. rebase --force-with-lease before pushing.",
    ]);
  });

  it("returns empty when neither behind nor conflicting", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", CLEAN)).toEqual([]);
  });

  it("returns empty when the hint is empty", () => {
    expect(buildBehindBaseHintInstruction("main", "", BEHIND)).toEqual([]);
  });

  it("trims surrounding whitespace from the configured hint", () => {
    expect(buildBehindBaseHintInstruction("main", "  rebase  ", BEHIND)).toEqual([
      "The branch is behind PR base branch `main`. rebase before pushing.",
    ]);
  });

  it("treats a whitespace-only hint as unconfigured", () => {
    expect(buildBehindBaseHintInstruction("main", "   ", BEHIND)).toEqual([]);
  });

  it("treats a non-string hint from a malformed rc file as unconfigured", () => {
    // yaml parsing does not enforce the TS type at runtime (e.g. `behindBaseHint: true`).
    const malformed = true as unknown as string;
    expect(buildBehindBaseHintInstruction("main", malformed, BEHIND)).toEqual([]);
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

  it("emits one triage pointer for every failing check, including bare and rerun-authorized", () => {
    const pointer = ['Triage `## Failing checks`. Playbook: "CI failure triage".'];
    expect(
      buildFailingCheckInstructions([
        check({}),
        check({ runId: "124", conclusion: "CANCELLED" }),
        check({ runId: "125", conclusion: "STARTUP_FAILURE" }),
        check({ runId: null, detailsUrl: "https://ci.example/check" }),
        check({ runId: null, detailsUrl: null }),
      ]),
    ).toEqual(pointer);
    expect(buildFailingCheckInstructions([check({ runId: null, detailsUrl: null })])).toEqual(
      pointer,
    );
    expect(
      buildFailingCheckInstructions([
        check({
          conclusion: "CANCELLED",
          rerunCommand: "gh run rerun 124 -R owner/repo",
        }),
      ]),
    ).toEqual(pointer);
  });
});

describe("buildResolveCommandInstruction", () => {
  const rendered = "pr-shepherd apply review 42";

  it("returns nothing when there are no mutations", () => {
    expect(
      buildResolveCommandInstruction(resolveCommand({ hasMutations: false }), rendered),
    ).toEqual([]);
  });

  it("emits only the run step with the command inline when nothing else applies", () => {
    expect(buildResolveCommandInstruction(resolveCommand({}), rendered)).toEqual([
      "Run, even if no code changed: `pr-shepherd apply review 42`",
    ]);
  });

  it("does not repeat routing policy when replyThreadIds is non-empty", () => {
    expect(
      buildResolveCommandInstruction(resolveCommand({ replyThreadIds: ["PRRT_1"] }), rendered),
    ).toEqual(["Run, even if no code changed: `pr-shepherd apply review 42`"]);
  });

  it("omits routing policy when replyThreadIds is empty", () => {
    const instructions = buildResolveCommandInstruction(resolveCommand({}), rendered);
    expect(instructions.some((i) => i.includes("remove any `--reply-thread-ids` entry"))).toBe(
      false,
    );
  });

  it("folds the $DISMISS_MESSAGE substitution into the run step, with no $HEAD_SHA step", () => {
    const instructions = buildResolveCommandInstruction(
      resolveCommand({
        replyThreadIds: ["PRRT_1"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
      }),
      rendered,
    );
    expect(instructions).toEqual([
      "Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review 42`",
    ]);
    expect(instructions.join("\n")).not.toContain("$HEAD_SHA");
  });
});

describe("buildFixCompletionInstruction", () => {
  const continuation = "`[FIX_CODE]` is non-terminal. Rerun the same command now.";

  it("hands control back without restating commit or push policy", () => {
    expect(buildFixCompletionInstruction()).toBe(continuation);
    expect(continuation).not.toMatch(/commit|push/i);
  });

  it.each([
    check({ runId: null, detailsUrl: null }),
    check({ conclusion: "ACTION_REQUIRED", logExcerpt: undefined }),
    check({ conclusion: "STARTUP_FAILURE", logExcerpt: undefined }),
  ])("never emits terminal handoff wording for a FIX_CODE completion", () => {
    const completion = buildFixCompletionInstruction();
    expect(completion).toContain("`[FIX_CODE]` is non-terminal");
    expect(completion).not.toMatch(/hand[- ]?off|stop polling|human direction/i);
  });
});
