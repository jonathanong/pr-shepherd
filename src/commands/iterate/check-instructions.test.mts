import { describe, it, expect } from "vitest";
import type { AgentCheck, ResolveCommand } from "../../types.mts";
import {
  buildBehindBaseHintInstruction,
  buildFailingCheckInstructions,
  buildFixCompletionInstruction,
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
    ...overrides,
  };
}

describe("buildBehindBaseHintInstruction", () => {
  it("renders the hint when behind and configured", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", true)).toEqual([
      "The branch is behind `origin/main`. rebase --force-with-lease before pushing.",
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
      "The branch is behind `origin/main`. rebase before pushing.",
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

describe("buildFailingCheckInstructions", () => {
  it("returns nothing when there are no failing checks", () => {
    expect(buildFailingCheckInstructions([])).toEqual([]);
  });

  it("emits a single triage pointer for any GitHub Actions / external failure, plus the bare-check escalation", () => {
    // Per-conclusion rerun mechanics (gh run view/rerun rules for CANCELLED,
    // STARTUP_FAILURE, external) are invariant text now covered by the pr-shepherd
    // skill's "CI failure triage" playbook — see the collision note on
    // buildFailingCheckInstructions in check-instructions.mts. Only the `(no runId)`
    // bare-check escalation stays here, because it flips buildFixCompletionInstruction
    // to a human-handoff terminal state.
    const instructions = buildFailingCheckInstructions([
      check({}),
      check({ runId: "124", conclusion: "CANCELLED" }),
      check({ runId: "125", conclusion: "STARTUP_FAILURE" }),
      check({ runId: null, detailsUrl: "https://ci.example/check" }),
      check({ runId: null, detailsUrl: null }),
    ]);

    expect(instructions).toEqual([
      'Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.',
      "For each `(no runId)` failure, escalate to a human because no log or URL is available.",
    ]);
  });

  it("emits only the bare-check escalation when every failure lacks a runId and a URL", () => {
    expect(buildFailingCheckInstructions([check({ runId: null, detailsUrl: null })])).toEqual([
      "For each `(no runId)` failure, escalate to a human because no log or URL is available.",
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
      "Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.",
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
      "Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.",
      "Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.",
      "Replace `$DISMISS_MESSAGE` with one sentence describing what changed.",
      'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.',
    ]);
  });
});

describe("buildFixCompletionInstruction", () => {
  it("hands control back to the caller for the next tick", () => {
    expect(buildFixCompletionInstruction([check({})])).toBe(
      "`[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.",
    );
  });

  it("pauses polling when a bare check requires a human handoff", () => {
    expect(buildFixCompletionInstruction([check({ runId: null, detailsUrl: null })])).toBe(
      "`[FIX_CODE]` requires a human handoff for an uninspectable failing check. Stop polling after escalating, and resume only after human direction.",
    );
  });
});
