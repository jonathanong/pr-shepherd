import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import type { RawCheckRollup, RawSummaryCommit, RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };
const HEAD = "a".repeat(40);
const QUEUE = "b".repeat(40);

type Contexts = RawCheckRollup["contexts"];

function contexts(names: string[], totalCount: number, startCursor?: string): Contexts {
  return {
    totalCount,
    pageInfo: { hasPreviousPage: startCursor !== undefined, startCursor: startCursor ?? null },
    nodes: names.map((name) => ({
      __typename: "CheckRun" as const,
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      checkSuite: null,
    })),
  };
}

function commit(oid: string, window: Contexts | null): RawSummaryCommit {
  return { oid, statusCheckRollup: window && { contexts: window } };
}

function rawPr(head: RawSummaryCommit | null, queue: RawSummaryCommit | null = null) {
  return {
    commits: { nodes: head ? [{ commit: head }] : [] },
    mergeQueueEntry: queue && { headCommit: queue },
  } as unknown as RawSummaryPr;
}

function olderPage(oid: string, window: Contexts | null, typename = "Commit") {
  return {
    data: {
      repository: {
        object: { __typename: typename, oid, statusCheckRollup: window && { contexts: window } },
      },
    },
  };
}

function names(raw: RawSummaryPr): string[] {
  return raw.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes.map((node) =>
    node.__typename === "CheckRun" ? node.name : node.context,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("hydratePollSummaryChecks", () => {
  it("leaves a complete window unfetched and drops its cursor", async () => {
    const window = contexts(["build"], 1);
    window.pageInfo.startCursor = "cursor-1";
    const raw = rawPr(commit(HEAD, window));

    await hydratePollSummaryChecks(raw, repo);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(raw.commits.nodes[0]!.commit.statusCheckRollup!.contexts.pageInfo).toEqual({
      hasPreviousPage: false,
    });
  });

  it("prepends older pages in GitHub order until the window is complete", async () => {
    const raw = rawPr(commit(HEAD, contexts(["c", "d"], 4, "cursor-3")));
    mockGraphql
      .mockResolvedValueOnce(olderPage(HEAD, contexts(["b"], 4, "cursor-2")) as never)
      .mockResolvedValueOnce(olderPage(HEAD, contexts(["a"], 4)) as never);

    await hydratePollSummaryChecks(raw, repo);

    expect(names(raw)).toEqual(["a", "b", "c", "d"]);
    expect(summarizePollSummaryChecks(raw)).toEqual({ passing: 4 });
    expect(mockGraphql.mock.calls.map((call) => call[1])).toEqual([
      { owner: "acme", repo: "widgets", oid: HEAD, before: "cursor-3" },
      { owner: "acme", repo: "widgets", oid: HEAD, before: "cursor-2" },
    ]);
  });

  it("pages the merge-queue commit by its own oid", async () => {
    const raw = rawPr(commit(HEAD, contexts(["build"], 1)), commit(QUEUE, contexts(["b"], 2, "q")));
    mockGraphql.mockResolvedValueOnce(olderPage(QUEUE, contexts(["a"], 2)) as never);

    await hydratePollSummaryChecks(raw, repo);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql.mock.calls[0]![1]).toMatchObject({ oid: QUEUE, before: "q" });
    expect(summarizePollSummaryChecks(raw).incomplete).toBeUndefined();
  });

  it("skips commits without a status rollup", async () => {
    const raw = rawPr(commit(HEAD, null));

    await hydratePollSummaryChecks(raw, repo);
    await hydratePollSummaryChecks(rawPr(null), repo);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(raw.commits.nodes[0]!.commit.statusCheckRollup).toBeNull();
  });

  it("keeps the window incomplete when GitHub omits the start cursor", async () => {
    const window = contexts(["b"], 2, "cursor");
    window.pageInfo.startCursor = null;
    const raw = rawPr(commit(HEAD, window));

    await hydratePollSummaryChecks(raw, repo);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(summarizePollSummaryChecks(raw).incomplete).toBe(true);
  });

  it.each([
    ["the commit is gone", { data: { repository: { object: null } } }],
    ["the object is not a commit", olderPage(HEAD, contexts(["a"], 2), "Tree")],
    ["another commit answered", olderPage(QUEUE, contexts(["a"], 2))],
    ["the rollup disappeared", olderPage(HEAD, null)],
    ["pages overlap", olderPage(HEAD, contexts(["a", "b"], 2))],
  ])("keeps the window incomplete when %s", async (_label, response) => {
    const raw = rawPr(commit(HEAD, contexts(["b"], 2, "cursor")));
    mockGraphql.mockResolvedValueOnce(response as never);

    await hydratePollSummaryChecks(raw, repo);

    expect(summarizePollSummaryChecks(raw).incomplete).toBe(true);
    expect(raw.commits.nodes[0]!.commit.statusCheckRollup!.contexts.pageInfo).toEqual({
      hasPreviousPage: true,
    });
  });
});
