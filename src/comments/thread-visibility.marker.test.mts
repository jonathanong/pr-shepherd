import { describe, expect, it } from "vitest";
import { classifyThreadVisibility } from "./thread-visibility.mts";
import { hashBody } from "../state/seen-comments.mts";
import { addPrShepherdMarker } from "./marker.mts";
import type { ReviewThread, ReviewThreadComment } from "../types.mts";

function makeComment(
  id: string,
  body: string,
  overrides: Partial<ReviewThreadComment> = {},
): ReviewThreadComment {
  return {
    id,
    isMinimized: false,
    author: "reviewer",
    authorType: "User",
    body,
    url: "",
    createdAtUnix: 1,
    ...overrides,
  };
}

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "body",
    url: "",
    createdAtUnix: 1,
    ...overrides,
  };
}

describe("classifyThreadVisibility — pr-shepherd marker", () => {
  it("suppresses active thread where the last comment has the marker", () => {
    const thread = makeThread({
      id: "t1",
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed in latest commit")),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.activeThreads).toEqual([]);
  });

  it("surfaces active thread when a human replied after pr-shepherd", () => {
    const thread = makeThread({
      id: "t1",
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed in latest commit")),
        makeComment("c3", "thanks, looks good but also fix X", { author: "reviewer" }),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.activeThreads.map((t) => t.id)).toEqual(["t1"]);
  });

  it("surfaces the whole thread when re-surfaced after human reply", () => {
    const thread = makeThread({
      id: "t1",
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed in latest commit")),
        makeComment("c3", "thanks but also fix X"),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.activeThreads[0]?.comments).toHaveLength(3);
  });

  it("only surfaces re-surfaced thread once via seen-marker", () => {
    const body1 = "reviewer comment";
    const body2 = addPrShepherdMarker("addressed");
    const body3 = "thanks but also fix X";
    const transcript = [body1, body2, body3].join("\n\n--- thread comment ---\n\n");
    const thread = makeThread({
      id: "t1",
      comments: [makeComment("c1", body1), makeComment("c2", body2), makeComment("c3", body3)],
    });
    const seenMap = new Map([["t1", { seenAt: 1000, bodyHash: hashBody(transcript) }]]);

    const result = classifyThreadVisibility([thread], seenMap);

    expect(result.activeThreads).toEqual([]);
  });

  it("suppresses outdated first-look thread ending with marker", () => {
    const thread = makeThread({
      id: "t1",
      isOutdated: true,
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed")),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.firstLookThreads).toEqual([]);
  });

  it("suppresses resolved first-look thread ending with marker", () => {
    const thread = makeThread({
      id: "t1",
      isResolved: true,
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed")),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.firstLookThreads).toEqual([]);
  });

  it("does not suppress resolution-only thread ending with marker", () => {
    const thread = makeThread({
      id: "t1",
      isOutdated: true,
      comments: [
        makeComment("c1", "reviewer comment"),
        makeComment("c2", addPrShepherdMarker("addressed")),
      ],
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.resolutionOnlyThreads.map((t) => t.id)).toEqual(["t1"]);
  });

  it("suppresses active thread with only a body (no comments array) ending with marker", () => {
    const thread = makeThread({
      id: "t1",
      body: addPrShepherdMarker("pr-shepherd started this thread"),
      comments: undefined,
    });

    const result = classifyThreadVisibility([thread], new Map());

    expect(result.activeThreads).toEqual([]);
  });
});
