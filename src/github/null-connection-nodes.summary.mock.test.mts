import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";
import {
  comment,
  raw as reviewRaw,
  thread,
} from "../../test-helpers/github/poll-summary-review-raw.mts";

const { mockLoadConfig, mockGraphql } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockGraphql: vi.fn(),
}));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: mockGraphql }));
vi.mock("../classify/loader.mts", () => ({ loadClassifyRules: vi.fn().mockResolvedValue([]) }));

import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import { evaluatePollSummaryReview } from "./poll-summary-review.mts";
import { runWithGithubTransport } from "./transport.mts";
import {
  annotationProbeUnavailable,
  hydrateAnnotationTotals,
} from "./poll-summary-annotation-probe.mts";
import { prepareBatchReceiptEvidence } from "./batch-receipt-evidence.mts";
import { summaryComplete } from "./stack-handoff-page.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { RawPr } from "./batch-raw-types.mts";

const repo = { owner: "acme", name: "widgets" };
const HEAD = "a".repeat(40);
const check = { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS" };

function summary(nodes: unknown[], extra: Record<string, unknown> = {}): RawSummaryPr {
  const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
  return {
    number: 42,
    updatedAt: "2026-10-01T00:00:00Z",
    headRefOid: HEAD,
    baseRefOid: "b".repeat(40),
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: {
      nodes: [
        {
          commit: {
            oid: HEAD,
            statusCheckRollup: {
              contexts: {
                totalCount: nodes.length,
                pageInfo: { hasPreviousPage: false },
                nodes,
              },
            },
          },
        },
      ],
    },
    ...extra,
  } as unknown as RawSummaryPr;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(
    testConfig({
      "bot-usernames": [],
      actions: { "auto-minimize-suppressed": false },
    }),
  );
});

describe("compact poll with a null node", () => {
  it("reports checks incomplete and gives no receipt fingerprint for a null check context", async () => {
    const snapshot = summary([null, check]);
    await hydratePollSummaryChecks(snapshot, repo);

    expect(snapshot.unreadNodes).toEqual({ checks: true });
    expect(summarizePollSummaryChecks(snapshot)).toMatchObject({ incomplete: true, passing: 1 });
    expect(fingerprintRawSummaryPr(snapshot)).toBeNull();
  });

  it("stays complete when nothing is null", async () => {
    const snapshot = summary([check]);
    await hydratePollSummaryChecks(snapshot, repo);
    expect(snapshot.unreadNodes).toBeUndefined();
    expect(summarizePollSummaryChecks(snapshot).incomplete).toBeUndefined();
  });

  it("drops a null context from an older page and reports checks unread", async () => {
    const snapshot = summary([check]);
    const window = snapshot.commits.nodes[0]!.commit.statusCheckRollup!.contexts;
    window.pageInfo = { hasPreviousPage: true, startCursor: "s" };
    window.totalCount = 2;
    mockGraphql.mockResolvedValueOnce({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: HEAD,
            statusCheckRollup: {
              contexts: {
                totalCount: 2,
                pageInfo: { hasPreviousPage: false },
                nodes: [null, check],
              },
            },
          },
        },
      },
    });

    await runWithGithubTransport("graphql", () => hydratePollSummaryChecks(snapshot, repo));

    expect(snapshot.unreadNodes).toEqual({ checks: true });
    expect(summarizePollSummaryChecks(snapshot).incomplete).toBe(true);
  });

  it("reports review incomplete for an unreadable thread instead of counting it absent", async () => {
    const input = reviewRaw({ threads: [thread("t1", "finding")] });
    input.unreadNodes = { feedback: true };
    const { review } = await runWithGithubTransport("graphql", () =>
      evaluatePollSummaryReview(input, new Map(), true),
    );
    expect(review).toMatchObject({ threads: 1, incomplete: true });
  });

  it("does not mark review incomplete when only checks were unread", async () => {
    const input = reviewRaw({ comments: [comment("c1", "hi", { isMinimized: true })] });
    input.unreadNodes = { checks: true };
    const { review } = await runWithGithubTransport("graphql", () =>
      evaluatePollSummaryReview(input, new Map(), true),
    );
    expect(review.incomplete).toBeUndefined();
  });
});

describe("annotation probe with a null check context", () => {
  it("treats the page as untrustworthy, so no total is trusted", async () => {
    const snapshot = summary([{ ...check, id: "CR1" }]);
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: HEAD,
            statusCheckRollup: {
              contexts: { pageInfo: { hasPreviousPage: false }, nodes: [null] },
            },
          },
        },
      },
    });

    await expect(hydrateAnnotationTotals(snapshot, repo)).resolves.toBe(false);

    expect(annotationProbeUnavailable(snapshot)).toBe(true);
  });
});

describe("evidence built from an unread summary", () => {
  it("gives no READY receipt evidence", async () => {
    const snapshot = summary([check]);
    snapshot.unreadNodes = { feedback: true };
    const batch = { number: 42, headRefOid: HEAD } as unknown as RawPr;
    await expect(prepareBatchReceiptEvidence(snapshot, batch, [], repo)).resolves.toBeNull();
  });

  it("hands nothing off for a layer with an unread node", () => {
    const layer = { unreadNodes: { checks: true } } as unknown as RawSummaryPr;
    const source = { read: { stack: {} } } as never;
    expect(summaryComplete(layer, source)).toBe(false);
  });
});
