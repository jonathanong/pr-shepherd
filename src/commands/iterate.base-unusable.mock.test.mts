import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

function conflictReport(extra: Record<string, unknown>) {
  return makeReport({
    status: "FAILING",
    baseBranch: "release/é",
    mergeStatus: {
      status: "CONFLICTS",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "DIRTY",
    },
    ...extra,
  });
}

async function firstStep(extra: Record<string, unknown> = {}): Promise<string> {
  mockRunCheck.mockResolvedValue(conflictReport(extra));
  const result = await runIterate(makeOpts());
  if (result.action !== "triage") throw new Error("expected triage");
  return result.triage.instructions[0] ?? "";
}

describe("runIterate with an unusable base branch name", () => {
  it("reads the base with gh pr view on GraphQL", async () => {
    expect(await firstStep()).toContain("`gh pr view https://github.com/owner/repo/pull/42 --json");
  });

  it("reads the base through the REST API when the report came from REST", async () => {
    const step = await firstStep({ transport: "rest" });
    expect(step).toContain("`gh api repos/owner/repo/pulls/42 --jq .base.ref`");
    expect(step).not.toContain("gh pr view");
  });
});
