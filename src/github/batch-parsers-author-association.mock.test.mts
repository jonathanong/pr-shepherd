import { describe, expect, it } from "vitest";
import {
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
  registerHooks,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — author association", () => {
  it("surfaces GitHub's raw value on every supported comment and review path", async () => {
    const threadComment = (
      id: string,
      authorAssociation: "OWNER" | "CONTRIBUTOR",
      login: string,
    ) => ({
      id,
      isMinimized: false,
      authorAssociation,
      author: { __typename: "User", login },
      body: id,
      url: "",
      path: "foo.ts",
      line: 1,
      startLine: null,
      createdAt: "2024-01-01T00:00:00Z",
    });
    const prComment = (id: string, authorAssociation: "NONE" | "FIRST_TIMER" | "MANNEQUIN") => ({
      id,
      isMinimized: false,
      authorAssociation,
      author: { __typename: "User", login: id },
      body: id,
      url: "",
      createdAt: "2024-01-01T00:00:00Z",
    });
    const pr = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-1",
            isResolved: false,
            isOutdated: false,
            comments: {
              nodes: [
                threadComment("t-1-c", "OWNER", "alice"),
                threadComment("t-1-reply", "CONTRIBUTOR", "bob"),
              ],
            },
          },
        ],
      },
      comments: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          prComment("c-none", "NONE"),
          prComment("c-first", "FIRST_TIMER"),
          prComment("c-mannequin", "MANNEQUIN"),
        ],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CR",
            authorAssociation: "COLLABORATOR",
            author: { __typename: "User", login: "reviewer" },
            body: "changes",
          },
        ],
      },
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CM",
            isMinimized: false,
            authorAssociation: "MEMBER",
            author: { __typename: "Bot", login: "copilot" },
            body: "summary",
          },
        ],
      },
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_AP",
            isMinimized: false,
            authorAssociation: "FIRST_TIME_CONTRIBUTOR",
            author: { __typename: "User", login: "alice" },
            body: "",
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.reviewThreads[0]!.authorAssociation).toBe("OWNER");
    expect(data.reviewThreads[0]!.comments?.map((c) => c.authorAssociation)).toEqual([
      "OWNER",
      "CONTRIBUTOR",
    ]);
    expect(data.comments.map((c) => c.authorAssociation)).toEqual([
      "NONE",
      "FIRST_TIMER",
      "MANNEQUIN",
    ]);
    expect(data.changesRequestedReviews[0]!.authorAssociation).toBe("COLLABORATOR");
    expect(data.reviewSummaries[0]!.authorAssociation).toBe("MEMBER");
    expect(data.approvedReviews[0]!.authorAssociation).toBe("FIRST_TIME_CONTRIBUTOR");
  });
});
