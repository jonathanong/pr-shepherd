import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { formatPendingDeployment } from "./pending-deployments-format.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { toAgentCheck } from "../reporters/agent.mts";
import type { PendingDeployment, TriagedCheck } from "../types.mts";

const deployment: PendingDeployment = {
  environment: "production",
  currentUserCanApprove: false,
  reviewers: [
    { type: "Team", name: "release-managers" },
    { type: "User", name: "alice" },
  ],
  waitTimerMinutes: 5,
};

describe("pending deployment rendering", () => {
  it("renders raw environment, reviewers, capability, and timer", () => {
    expect(formatPendingDeployment(deployment)).toBe(
      "environment `production`, required reviewers team `release-managers`, `@alice`, viewer can approve: no, wait timer 5 min",
    );
    expect(formatPendingDeployment({ environment: "staging", currentUserCanApprove: true })).toBe(
      "environment `staging`, viewer can approve: yes",
    );
  });

  it("renders under a failing check in the triage Failing checks section", () => {
    const failing: TriagedCheck = {
      name: "Deploy / approve",
      status: "COMPLETED",
      conclusion: "ACTION_REQUIRED",
      detailsUrl: "https://github.com/owner/repo/actions/runs/700",
      event: "pull_request",
      runId: "700",
      category: "failing",
      pendingDeployments: [deployment],
    };
    const result = makeIterateResult("triage");
    if (result.action !== "triage") throw new Error("expected triage fixture");
    result.triage.checks = [toAgentCheck(failing)];
    expect(formatIterateResult(result)).toContain(
      "- `700` — `Deploy / approve` [conclusion: ACTION_REQUIRED]\n  pending deployment: environment `production`",
    );
  });

  it("renders a wait-header line without a run id", () => {
    const result = makeIterateResult("wait");
    result.inProgressChecks = [
      {
        name: "Deploy",
        status: "WAITING",
        runId: null,
        detailsUrl: null,
        pendingDeployments: [deployment],
      },
    ];
    expect(formatIterateResult(result)).toContain(
      "**pending deployment** `Deploy` — environment `production`",
    );
  });
});
