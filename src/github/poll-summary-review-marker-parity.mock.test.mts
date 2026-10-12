import { describe, expect, it, vi } from "vitest";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { ReviewThread } from "../types.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";

vi.mock("../classify/loader.mts", () => ({ loadClassifyRules: vi.fn().mockResolvedValue([]) }));
import { summarizePollSummaryReview } from "./poll-summary-review.mts";

function snapshot(resolved: boolean | undefined, bodies: string[], truncated = false) {
  const comments = bodies.map((body, index) => ({
    id: `comment-${index}`,
    body,
    author: { login: "review-bot", __typename: "Bot" },
    isMinimized: false,
    url: "",
  }));
  const raw = {
    comments: { totalCount: 0, nodes: [], pageInfo: { hasPreviousPage: false } },
    reviews: { totalCount: 0, nodes: [], pageInfo: { hasPreviousPage: false } },
    reviewThreads: {
      totalCount: 1,
      pageInfo: { hasPreviousPage: false },
      nodes: [
        {
          id: "thread",
          isResolved: resolved,
          isOutdated: false,
          path: "src/example.mts",
          comments: {
            totalCount: bodies.length,
            nodes: comments,
            pageInfo: { hasPreviousPage: truncated },
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
  const full = {
    id: "thread",
    isResolved: resolved,
    isOutdated: false,
    isMinimized: false,
    path: "src/example.mts",
    line: 1,
    startLine: null,
    author: "review-bot",
    authorType: "Bot",
    body: bodies[0],
    url: "",
    createdAtUnix: 1,
    comments: comments.map((comment) => ({
      ...comment,
      author: "review-bot",
      authorType: "Bot",
      createdAtUnix: 1,
    })),
  } as ReviewThread;
  return { raw, full };
}

const replied = ["Please fix this", addPrShepherdMarker("Addressed in the published commit")];

describe("compact review certification and terminal Shepherd replies", () => {
  it("matches full first-look handling of an already resolved complete reply", async () => {
    const { raw, full } = snapshot(true, replied);
    const visibility = classifyThreadVisibility([full], new Map());
    expect(visibility.firstLookThreads).toEqual([]);
    expect(visibility.activeThreads).toEqual([]);
    expect(visibility.resolutionOnlyThreads).toEqual([]);
    expect(await summarizePollSummaryReview(raw, new Map(), true)).toEqual({ threads: 1 });
  });

  it("retains an unseen resolved thread without a terminal reply", async () => {
    const { raw, full } = snapshot(true, ["Please fix this"]);
    expect(classifyThreadVisibility([full], new Map()).firstLookThreads).toHaveLength(1);
    expect((await summarizePollSummaryReview(raw, new Map(), true)).actionable).toBe(1);
  });

  it("retains a new reviewer reply after the Shepherd response", async () => {
    const { raw, full } = snapshot(true, [...replied, "The change still misses this case"]);
    expect(classifyThreadVisibility([full], new Map()).firstLookThreads).toHaveLength(1);
    expect((await summarizePollSummaryReview(raw, new Map(), true)).actionable).toBe(1);
  });

  it("does not certify an unresolved thread merely because it has a reply marker", async () => {
    const { raw, full } = snapshot(false, replied);
    expect(classifyThreadVisibility([full], new Map()).resolutionOnlyThreads).toHaveLength(1);
    expect((await summarizePollSummaryReview(raw, new Map(), true)).actionable).toBe(1);
  });

  it("does not infer resolution when the transport omits it", async () => {
    const { raw } = snapshot(undefined, replied);
    expect((await summarizePollSummaryReview(raw, new Map(), true)).actionable).toBe(1);
  });

  it("does not certify a marker from a truncated comment window", async () => {
    const { raw } = snapshot(true, replied, true);
    expect(await summarizePollSummaryReview(raw, new Map(), true)).toEqual({
      threads: 1,
      actionable: 1,
      incomplete: true,
    });
  });
});
