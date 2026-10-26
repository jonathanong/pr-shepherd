import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { toAgentCheck } from "../reporters/agent.mts";
import type { IterateResult, TriagedCheck } from "../types.mts";

const stuck: TriagedCheck = {
  name: "tests",
  status: "IN_PROGRESS",
  suiteStatus: "COMPLETED",
  conclusion: null,
  detailsUrl: "https://github.com/owner/repo/actions/runs/9",
  event: "pull_request",
  runId: "9",
  category: "failing",
};

describe("stuck check projection", () => {
  it("carries raw status and suite status only for a stuck check", () => {
    expect(toAgentCheck(stuck)).toMatchObject({ status: "IN_PROGRESS", suiteStatus: "COMPLETED" });
    const completed = toAgentCheck({ ...stuck, status: "COMPLETED", conclusion: "FAILURE" });
    expect(completed).not.toHaveProperty("status");
    expect(completed).not.toHaveProperty("suiteStatus");
    expect(toAgentCheck({ ...stuck, suiteStatus: undefined })).not.toHaveProperty("status");
  });

  it("renders the status tag under Failing checks instead of a conclusion", () => {
    const result: IterateResult = { ...makeIterateResult("triage") };
    if (result.action !== "triage") throw new Error("expected triage fixture");
    result.triage.checks = [
      { ...toAgentCheck(stuck), rerunCommand: "gh run rerun 9 -R owner/repo" },
    ];
    const output = formatIterateResult(result);
    expect(output).toContain("- `9` — `tests` [status: IN_PROGRESS, suite: COMPLETED]\n");
    expect(output).toContain("  rerun: `gh run rerun 9 -R owner/repo`");
    expect(output).not.toContain("[conclusion:");
  });
});
