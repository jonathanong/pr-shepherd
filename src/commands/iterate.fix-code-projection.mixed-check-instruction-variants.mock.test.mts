import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
  };
}

describe("runIterate — fix_code agent projection", () => {
  it("combined runId + external + bare checks — the triage pointer and bare-check escalation coexist", async () => {
    // Guards against a filter-predicate drift between buildFixInstructions
    // (which buckets checks by truthiness) and the CLI formatter (which emits
    // bullets by the same truthiness). If either side stops agreeing, an
    // emitted bullet shape would have no matching instruction. runId and external
    // (URL, no runId) checks now share one triage pointer — see "CI failure
    // triage" in the pr-shepherd skill for the per-conclusion mechanics; only the
    // bare (no runId, no URL) case still gets its own CLI-side instruction, since
    // it flips completion to a human-handoff terminal state.
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const bareCheck = {
      name: "mystery",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [ghActionsCheck, externalCheck, bareCheck],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(3);
      const joined = result.fix.instructions.join("\n");
      // The runId and external (URL, no runId) variants share one triage pointer; the
      // bare (no runId, no URL) variant still gets its own instruction.
      expect(joined).toContain("Triage every failure under `## Failing checks`");
      expect(joined).toContain("(no runId)");
      expect(joined.match(/Triage every failure under `## Failing checks`/g)).toHaveLength(1);
      expect(joined.match(/\(no runId\)/g)).toHaveLength(1);
    }
  });
});
