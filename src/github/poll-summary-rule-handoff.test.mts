import { describe, expect, it } from "vitest";
import type { PollSummaryItem } from "../types.mts";
import { patchHandoffLayers } from "./poll-summary-rule-handoff.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const layer = (number: number) =>
  ({
    number,
    comments: { nodes: [{ id: "c1", isMinimized: false }] },
    reviews: { nodes: [{ id: "r1", isMinimized: false }] },
    reviewThreads: { nodes: [{ id: "t1", isResolved: false }] },
  }) as unknown as RawSummaryPr;

describe("patchHandoffLayers", () => {
  it("reflects confirmed minimizes and resolves, and ignores other layers and rows", () => {
    const layers = [layer(1), layer(2)];
    patchHandoffLayers(layers, [
      {
        pr: 1,
        ruleAutoResolve: {
          summary: "s",
          threads: [{ id: "t1" }],
          minimized: [{ id: "c1" }, { id: "r1" }],
        },
      },
      { pr: 2 },
      { pr: 9, ruleAutoResolve: { summary: "s", threads: [{ id: "t1" }] } },
    ] as unknown as PollSummaryItem[]);
    expect(layers[0]!.comments.nodes[0]!.isMinimized).toBe(true);
    expect(layers[0]!.reviews.nodes[0]!.isMinimized).toBe(true);
    expect(layers[0]!.reviewThreads.nodes[0]!.isResolved).toBe(true);
    expect(layers[1]!.comments.nodes[0]!.isMinimized).toBe(false);
    expect(layers[1]!.reviewThreads.nodes[0]!.isResolved).toBe(false);
  });
});
