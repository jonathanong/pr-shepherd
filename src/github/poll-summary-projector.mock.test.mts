import { describe, expect, it, vi } from "vitest";

vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const repo = { owner: "acme", name: "widgets" };

function raw(overrides: Record<string, unknown> = {}): RawSummaryPr {
  return {
    number: 42,
    title: "Widgets",
    url: "",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "CHANGES_REQUESTED",
    isInMergeQueue: true,
    stack: { number: 7, size: 2, baseRefName: "main" },
    stackEntry: { position: 1 },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  } as RawSummaryPr;
}

describe("summarizePollSummaryPr", () => {
  it("projects bounded check/review slices and every command option", async () => {
    const item = await summarizePollSummaryPr(
      raw({
        stack: null,
        stackEntry: null,
        comments: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [{ id: "comment", body: "please fix", isMinimized: false, author: null }],
        },
        reviews: {
          totalCount: 3,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              id: "old",
              body: "old",
              state: "APPROVED",
              isMinimized: false,
              author: { login: "human" },
            },
            {
              id: "bot",
              body: "fix",
              state: "CHANGES_REQUESTED",
              isMinimized: false,
              author: { __typename: "Bot", login: "bot" },
            },
            {
              id: "new",
              body: "note",
              state: "COMMENTED",
              isMinimized: false,
              author: { login: "human" },
            },
          ],
        },
        reviewThreads: {
          totalCount: 2,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              id: "viewer-thread",
              isResolved: false,
              isOutdated: false,
              comments: {
                totalCount: 1,
                pageInfo: { hasPreviousPage: true },
                nodes: [
                  {
                    id: "reply",
                    body: "reply",
                    isMinimized: false,
                    viewerDidAuthor: true,
                    author: { login: "viewer" },
                  },
                ],
              },
            },
            {
              id: "resolved-thread",
              isResolved: true,
              isOutdated: true,
              comments: {
                totalCount: 1,
                pageInfo: { hasPreviousPage: false },
                nodes: [{ id: "body", body: "body", isMinimized: false, author: null }],
              },
            },
          ],
        },
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: "FAILURE",
                  contexts: {
                    totalCount: 5,
                    pageInfo: { hasPreviousPage: true },
                    nodes: [
                      {
                        __typename: "CheckRun",
                        status: "COMPLETED",
                        conclusion: "SKIPPED",
                        checkSuite: null,
                      },
                      {
                        __typename: "CheckRun",
                        status: "IN_PROGRESS",
                        conclusion: null,
                        checkSuite: null,
                      },
                      {
                        __typename: "CheckRun",
                        status: "COMPLETED",
                        conclusion: "SUCCESS",
                        checkSuite: { workflowRun: { event: "schedule" } },
                      },
                      { __typename: "StatusContext", state: "SUCCESS" },
                      { __typename: "StatusContext", state: "PENDING" },
                      { __typename: "StatusContext", state: "FAILURE" },
                    ],
                  },
                },
              },
            },
          ],
        },
      }),
      repo,
      { merge: true, readyDelaySeconds: 5, stallTimeoutSeconds: 10, noAutoMarkReady: true },
    );

    expect(item).toMatchObject({
      url: "https://github.com/acme/widgets/pull/42",
      checks: { passing: 1, failing: 1, inProgress: 2, skipped: 1, incomplete: true },
      review: { comments: 1, reviews: 3, threads: 2, actionable: 5, incomplete: true },
    });
    expect(item.pollCommand).toContain(
      "pr-shepherd https://github.com/acme/widgets/pull/42 --until-terminal --merge --ready-delay 5s --stall-timeout 10s --no-auto-mark-ready",
    );
  });

  it("marks a missing check rollup incomplete and preserves stack state", async () => {
    const item = await summarizePollSummaryPr(raw(), repo, {});
    expect(item).toMatchObject({
      checks: { incomplete: true },
      stack: { number: 7, position: 1, size: 2 },
      isInMergeQueue: true,
      reviewDecision: "CHANGES_REQUESTED",
    });
  });
});
