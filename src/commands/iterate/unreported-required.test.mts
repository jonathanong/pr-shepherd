import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IterateResultBase, ShepherdReport } from "../../types.mts";
import { planUnreportedRequired } from "./unreported-required.mts";

const stateKey = { owner: "acme", repo: "widgets", pr: 622 };
const headSha = "a".repeat(40);

function report(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 622,
    repo: "acme/widgets",
    baseBranch: "feature-parent",
    status: "PENDING",
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    mergeStatus: {
      status: "BLOCKED",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "BLOCKED",
      mergeRequirements: {
        approvals: { current: 0, requiredCount: 0 },
        conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
        stack: { number: 623, size: 2, position: 2, baseRefName: "main" },
      },
    },
    unreportedRequiredChecks: ["build", "tests"],
    trunkBehindBy: 6,
    stackBottomPr: 613,
    ...overrides,
  } as ShepherdReport;
}

const base = { pr: 622, repo: "acme/widgets" } as IterateResultBase;

describe("planUnreportedRequired", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-retrigger-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("asks for a trunk rebase when the stack is behind", async () => {
    const plan = await planUnreportedRequired({
      report: report(),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(plan.escalate).toBeUndefined();
    expect(plan.repairInstructions?.[0]).toContain("behind by 6");
    expect(plan.repairInstructions?.[0]).toContain("gh stack rebase");
    expect(plan.repairInstructions?.[0]).toContain("gh stack push");
    expect(plan.repairInstructions?.[0]).toContain("gh pr close 622 -R acme/widgets");
    expect(plan.repairInstructions?.[0]).toContain("gh pr reopen 622 -R acme/widgets");
  });

  it("remembers one reopen and escalates when the same head is still missing those checks", async () => {
    const current = report({ trunkBehindBy: undefined, stackBottomPr: 613 });
    const first = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(first.repairInstructions?.[0]).toContain("not behind");
    const second = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(second.repairInstructions).toBeUndefined();
    expect(second.escalate?.action).toBe("escalate");
    if (second.escalate?.action !== "escalate") return;
    expect(second.escalate.escalate.triggers).toEqual(["required-checks-unreported"]);
    expect(second.escalate.escalate.suggestion).toContain("`build`");
    expect(second.escalate.escalate.suggestion).toContain("Path filters");
  });

  it("does nothing once the required names have reported", async () => {
    const plan = await planUnreportedRequired({
      report: report({ unreportedRequiredChecks: undefined }),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(plan).toEqual({});
  });

  it("updates a non-stack PR from its base when that PR is behind", async () => {
    const current = report({
      trunkBehindBy: undefined,
      stackBottomPr: undefined,
      baseBranch: "main",
      mergeStatus: {
        status: "BEHIND",
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        reviewDecision: null,
        blockingBotReviewInProgress: false,
        mergeStateStatus: "BEHIND",
      },
    });
    const plan = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(plan.repairInstructions?.[0]).toContain("from `main`");
    expect(plan.repairInstructions?.[0]).toContain("BEHIND");
    expect(plan.repairInstructions?.[0]).not.toContain("gh stack rebase");
  });

  it("stays quiet while Actions is running, checks are failing, or the PR is queued", async () => {
    const running = await planUnreportedRequired({
      report: report({ actionsWorkflowInProgress: true, trunkBehindBy: undefined }),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    const failing = await planUnreportedRequired({
      report: report({
        checks: {
          passing: [],
          failing: [{ name: "tests" } as ShepherdReport["checks"]["failing"][number]],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    const queued = await planUnreportedRequired({
      report: report({ mergeQueue: { enabled: true, inQueue: true } }),
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    expect(running).toEqual({});
    expect(failing).toEqual({});
    expect(queued).toEqual({});
  });

  it("does not escalate while other autonomous work remains after the reopen", async () => {
    const current = report({ trunkBehindBy: undefined });
    await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: false,
    });
    const next = await planUnreportedRequired({
      report: current,
      base,
      stateKey,
      headSha,
      otherAutonomousWork: true,
    });
    expect(next).toEqual({});
  });
});
