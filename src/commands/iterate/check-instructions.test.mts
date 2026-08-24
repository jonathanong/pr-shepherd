import { describe, it, expect } from "vitest";
import type { AgentCheck } from "../../types.mts";
import {
  buildBehindBaseHintInstruction,
  buildFailingCheckInstructions,
  buildFixCompletionInstruction,
} from "./check-instructions.mts";

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
  it("emits every mixed failure category once in deterministic order", () => {
    const instructions = buildFailingCheckInstructions([
      check({}),
      check({ runId: "124", conclusion: "CANCELLED" }),
      check({ runId: "125", conclusion: "STARTUP_FAILURE" }),
      check({ runId: null, detailsUrl: "https://ci.example/check" }),
      check({ runId: null, detailsUrl: null }),
    ]);

    expect(instructions).toEqual([
      "For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.",
      "If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.",
      "Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.",
      "For each `[conclusion: CANCELLED]` failure, run `gh run rerun <runId>` unless this tick will push new commits.",
      "Do not treat a cancelled failure as resolved. `## Cancelled runs` is a different section.",
      "For each `[conclusion: STARTUP_FAILURE]` failure, inspect it with `gh run view <runId>` and rerun it with `gh run rerun <runId>` if warranted.",
      "For each `external` failure, open its URL and inspect it.",
      "For each `(no runId)` failure, escalate to a human because no log or URL is available.",
    ]);
  });
});

describe("buildFixCompletionInstruction", () => {
  it("preserves the current CLI mode and flags for the next tick", () => {
    expect(buildFixCompletionInstruction([check({})])).toBe(
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
    );
  });

  it("pauses polling when a bare check requires a human handoff", () => {
    expect(buildFixCompletionInstruction([check({ runId: null, detailsUrl: null })])).toBe(
      "`[FIX_CODE]` requires a human handoff for an uninspectable failing check. Stop polling after escalating, and resume only after human direction.",
    );
  });
});
