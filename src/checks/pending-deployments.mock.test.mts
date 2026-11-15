import { beforeEach, describe, expect, it, vi } from "vitest";

const { rest, failing } = vi.hoisted(() => ({ rest: vi.fn(), failing: { on: false } }));
// A plain wrapper rejects on demand: vitest reports rejections returned by a vi.fn as unhandled.
vi.mock("../github/http.mts", () => ({
  restWithRateLimit: async (...args: unknown[]) => {
    const result = await rest(...args);
    if (failing.on) throw new Error("boom");
    return result;
  },
}));

import { attachPendingDeployments } from "./pending-deployments.mts";
import { TriageBudget } from "./triage-budget.mts";
import type { CheckRun } from "../types.mts";

const repo = { owner: "owner", name: "repo" };
const stateKey = { owner: "owner", repo: "repo", pr: 1 };

function check(overrides: Partial<CheckRun>): CheckRun {
  return {
    name: "Deploy / production",
    status: "WAITING",
    conclusion: null,
    detailsUrl: "https://github.com/owner/repo/actions/runs/700/job/1",
    event: "pull_request",
    runId: "700",
    ...overrides,
  };
}

const production = {
  environment: { name: "production" },
  wait_timer: 5,
  current_user_can_approve: true,
  reviewers: [
    { type: "User", reviewer: { login: "alice" } },
    { type: "Team", reviewer: { slug: "release-managers" } },
    { type: "Bot", reviewer: { login: "ignored" } },
    { type: "User", reviewer: null },
  ],
};

beforeEach(() => {
  rest.mockReset();
  failing.on = false;
});

async function projected(items: unknown[]) {
  rest.mockResolvedValue({ data: items, rateLimit: undefined });
  const [result] = await attachPendingDeployments([check({})], repo);
  return result?.pendingDeployments;
}

describe("pending deployment projection", () => {
  it("keeps raw environment, reviewers, capability, and timer", async () => {
    expect(await projected([production])).toEqual([
      {
        environment: "production",
        currentUserCanApprove: true,
        reviewers: [
          { type: "User", name: "alice" },
          { type: "Team", name: "release-managers" },
        ],
        waitTimerMinutes: 5,
      },
    ]);
  });

  it("omits trivial fields and entries without an environment", async () => {
    expect(await projected([{ environment: { name: "staging" }, wait_timer: 0 }, {}])).toEqual([
      { environment: "staging", currentUserCanApprove: false },
    ]);
  });
});

describe("attachPendingDeployments", () => {
  it("makes no request when no check can be held on an environment", async () => {
    const checks = [
      check({ status: "IN_PROGRESS" }),
      check({ status: "COMPLETED", conclusion: "FAILURE" }),
      check({ runId: null, conclusion: "ACTION_REQUIRED", status: "COMPLETED" }),
    ];
    expect(await attachPendingDeployments(checks, repo, stateKey)).toBe(checks);
    expect(rest).not.toHaveBeenCalled();
  });

  it("fetches once per run for WAITING and ACTION_REQUIRED checks", async () => {
    rest.mockResolvedValue({ data: [production], rateLimit: undefined });
    const waiting = check({});
    const sibling = check({ name: "Deploy / other" });
    const gate = check({ runId: "701", status: "COMPLETED", conclusion: "ACTION_REQUIRED" });
    const plain = check({ runId: "702", status: "IN_PROGRESS" });
    const result = await attachPendingDeployments([waiting, sibling, gate, plain], repo, stateKey);
    expect(rest).toHaveBeenCalledTimes(2);
    expect(rest.mock.calls[0]?.[1]).toBe("/repos/owner/repo/actions/runs/700/pending_deployments");
    expect(rest.mock.calls[0]?.[3]).toEqual({
      conditional: { key: stateKey, name: "pending-deployments-run-700" },
    });
    expect(result[0]?.pendingDeployments?.[0]?.environment).toBe("production");
    expect(result[1]?.pendingDeployments).toHaveLength(1);
    expect(result[2]?.pendingDeployments).toHaveLength(1);
    expect(result[3]).toBe(plain);
  });

  it("adds nothing when GitHub lists no pending deployment (fork approval gate)", async () => {
    rest.mockResolvedValue({ data: [], rateLimit: undefined });
    const gate = check({ status: "COMPLETED", conclusion: "ACTION_REQUIRED" });
    const [result] = await attachPendingDeployments([gate], repo);
    expect(result).toBe(gate);
    expect(rest.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("ignores a non-array body", async () => {
    rest.mockResolvedValue({ data: {}, rateLimit: undefined });
    const waiting = check({});
    expect((await attachPendingDeployments([waiting], repo))[0]).toBe(waiting);
  });

  it("leaves the check alone when the read fails", async () => {
    failing.on = true;
    const waiting = check({});
    expect((await attachPendingDeployments([waiting], repo))[0]).toBe(waiting);
  });

  it("stops requesting once the budget reports the primary limit exhausted", async () => {
    rest.mockResolvedValue({ data: [], rateLimit: { remaining: 0 } });
    const budget = new TriageBudget();
    const checks = [check({}), check({ runId: "701" }), check({ runId: "702" })];
    await attachPendingDeployments(checks, repo, undefined, budget);
    rest.mockClear();
    await attachPendingDeployments([check({ runId: "703" })], repo, undefined, budget);
    expect(rest).not.toHaveBeenCalled();
  });
});
