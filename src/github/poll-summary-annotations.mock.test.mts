import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";

const { mockLoadConfig, mockBatch, mockHydrate, mockRateLimit } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockBatch: vi.fn(),
  mockHydrate: vi.fn(),
  mockRateLimit: vi.fn(),
}));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("./check-annotations-batch.mts", () => ({ fetchCheckRunAnnotationsBatch: mockBatch }));
vi.mock("./poll-summary-annotation-probe.mts", () => ({ hydrateAnnotationTotals: mockHydrate }));
vi.mock("../commands/poll-quota.mts", () => ({ pollRateLimitRetryAfterMs: mockRateLimit }));

import { applyUnseenCheckAnnotations } from "./poll-summary-annotations.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { PollSummaryChecks } from "../types.mts";

const repo = { owner: "acme", name: "widgets" };
type Node = NonNullable<
  RawSummaryPr["commits"]["nodes"][number]["commit"]["statusCheckRollup"]
>["contexts"]["nodes"][number];

function run(
  id: string,
  conclusion: string | null,
  total: number | undefined,
  status = "COMPLETED",
) {
  return {
    __typename: "CheckRun" as const,
    id,
    name: id,
    status,
    conclusion,
    checkSuite: null,
    ...(total !== undefined && { annotations: { totalCount: total } }),
  };
}

function pr(nodes: Node[], queue: Node[] = []): RawSummaryPr {
  const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
  const rollup = (list: Node[]) => ({
    contexts: { totalCount: list.length, pageInfo: { hasPreviousPage: false }, nodes: list },
  });
  return {
    number: 42,
    headRefOid: "a".repeat(40),
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    mergeQueueEntry: queue.length
      ? { headCommit: { oid: "c".repeat(40), statusCheckRollup: rollup(queue) } }
      : null,
    commits: { nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: rollup(nodes) } }] },
  } as unknown as RawSummaryPr;
}

type Routed = Parameters<typeof applyUnseenCheckAnnotations>[2];
const ready: Routed = { action: "cancel", reasons: ["appears-ready"] };
const annotation = (id: string) => ({ id });

async function apply(raw: RawSummaryPr, seen = new Map<string, unknown>(), routed: Routed = ready) {
  const checks: PollSummaryChecks = {};
  const result = await applyUnseenCheckAnnotations(raw, repo, routed, checks, seen, []);
  return { result, checks };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(testConfig({ checks: { "ci-trigger-events": ["pull_request"] } }));
  mockHydrate.mockResolvedValue(true);
  mockRateLimit.mockReturnValue(null);
});

describe("applyUnseenCheckAnnotations", () => {
  it("leaves a row that does not claim readiness alone, without any request", async () => {
    const routed = { action: "wait" as const, reasons: ["pending-or-unknown"] };
    const { result } = await apply(pr([run("skip", "SKIPPED", 2)]), new Map(), routed);
    expect(result).toBe(routed);
    expect(mockHydrate).not.toHaveBeenCalled();
  });

  it("makes no probe request when every completed check succeeded", async () => {
    const { result } = await apply(pr([run("ok", "SUCCESS", undefined)]));
    expect(result).toBe(ready);
    expect(mockHydrate).not.toHaveBeenCalled();
  });

  it("does not read annotations when no non-SUCCESS check has any", async () => {
    const raw = pr([
      run("ok", "SUCCESS", 3),
      run("skip", "SKIPPED", 0),
      run("bare", "NEUTRAL", undefined),
      run("running", null, 2, "IN_PROGRESS"),
      { __typename: "StatusContext", context: "legacy", state: "SUCCESS" },
    ]);
    const { result, checks } = await apply(raw);
    expect(result).toBe(ready);
    expect(checks).toEqual({});
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("ignores annotations on merge-queue checks and unknown ids", async () => {
    const raw = pr([run("ok", "SUCCESS", 0)], [run("queue-skip", "SKIPPED", 4)]);
    const { result } = await apply(raw);
    expect(result).toBe(ready);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["appears-ready", "cancel"],
    ["draft-appears-ready", "mark_ready"],
    ["already-in-merge-queue", "wait"],
    ["already-auto-merging", "wait"],
  ] as const)(
    "routes %s with an unseen skipped-check annotation to the full check",
    async (reason, action) => {
      mockBatch.mockResolvedValue({
        annotations: new Map([["skip", [annotation("n1"), annotation("n2")]]]),
        failures: [],
      });
      const { result, checks } = await apply(
        pr([run("skip", "SKIPPED", 2), run("ok", "SUCCESS", 1)]),
        new Map(),
        {
          action,
          reasons: [reason],
        },
      );
      expect(result).toEqual({ action: "triage", reasons: ["check-annotations"] });
      expect(checks.annotated).toBe(1);
      expect(mockBatch).toHaveBeenCalledWith(["skip"], {
        stateKey: { owner: "acme", repo: "widgets", pr: 42 },
        headSha: "a".repeat(40),
        expectedCounts: new Map([["skip", 2]]),
      });
    },
  );

  it("keeps the ready claim once every annotation has been shown", async () => {
    mockBatch.mockResolvedValue({
      annotations: new Map([["skip", [annotation("n1")]]]),
      failures: [],
    });
    const { result, checks } = await apply(pr([run("skip", "SKIPPED", 1)]), new Map([["n1", {}]]));
    expect(result).toBe(ready);
    expect(checks).toEqual({});
  });

  it("treats a check whose annotations could not be read as possible work", async () => {
    mockBatch.mockResolvedValue({
      annotations: new Map(),
      failures: [{ checkRunId: "fail", error: new Error("boom") }],
    });
    const { result, checks } = await apply(pr([run("fail", "TIMED_OUT", 5)]));
    expect(result.reasons).toEqual(["check-annotations"]);
    expect(checks.annotated).toBe(1);
  });

  it("treats a failed batch request as possible work", async () => {
    mockBatch.mockRejectedValue(new Error("network"));
    const { result, checks } = await apply(pr([run("a", "NEUTRAL", 1), run("b", "SKIPPED", 1)]));
    expect(result.reasons).toEqual(["check-annotations"]);
    expect(checks.annotated).toBe(2);
  });

  it("rethrows a rate limit so the poll can retry", async () => {
    const error = new Error("limited");
    mockBatch.mockRejectedValue(error);
    mockRateLimit.mockReturnValue({ ms: 1000 });
    await expect(apply(pr([run("a", "SKIPPED", 1)]))).rejects.toBe(error);
  });

  it("checks every non-SUCCESS completed check when totals could not be loaded", async () => {
    mockHydrate.mockResolvedValue(false);
    const { result, checks } = await apply(
      pr([run("skip", "SKIPPED", undefined), run("ok", "SUCCESS", undefined)]),
    );
    expect(result.reasons).toEqual(["check-annotations"]);
    expect(checks.annotated).toBe(1);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
