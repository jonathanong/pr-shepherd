import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  classifyItem,
  hashBody,
  loadSeenMap,
  markReviewInlineThreads,
  pruneResolvedReviewThreads,
} from "./seen-comments.mts";

let testStateDir: string;

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-seen-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("classifyItem", () => {
  it("returns 'new' when id not in map", () => {
    const map = new Map<string, { seenAt: number; [k: string]: unknown }>();
    expect(classifyItem("id1", "body", map)).toBe("new");
  });

  it("returns 'unchanged' when hash matches", () => {
    const map = new Map([["id1", { seenAt: 1000, bodyHash: hashBody("body") }]]);
    expect(classifyItem("id1", "body", map)).toBe("unchanged");
  });

  it("returns 'edited' when stored hash differs", () => {
    const map = new Map([["id1", { seenAt: 1000, bodyHash: hashBody("old body") }]]);
    expect(classifyItem("id1", "new body", map)).toBe("edited");
  });

  it("returns 'unchanged' for a stale pre-reply body marker", () => {
    const map = new Map([
      [
        "id1",
        {
          seenAt: 1000,
          bodyHash: hashBody("body\n\n--- thread comment ---\n\nreply"),
          previousBodyHash: hashBody("body"),
        },
      ],
    ]);
    expect(classifyItem("id1", "body", map)).toBe("unchanged");
  });

  it("returns 'unchanged' for a marker without bodyHash", () => {
    const map = new Map([["id1", { seenAt: 1000 }]]);
    expect(classifyItem("id1", "any body", map)).toBe("unchanged");
  });

  it("returns 'new' for review markers that only store inline thread ids", () => {
    const map = new Map([["PRR_1", { seenAt: 1000, inlineThreadIds: ["PRRT_1"] }]]);
    expect(classifyItem("PRR_1", "review summary", map)).toBe("new");
  });

  it("returns 'new' for review markers that only store unresolvedInlineThreadIds", () => {
    const map = new Map([["PRR_1", { seenAt: 1000, unresolvedInlineThreadIds: [] }]]);
    expect(classifyItem("PRR_1", "review summary", map)).toBe("new");
  });
});

describe("pruneResolvedReviewThreads", () => {
  it("prunes resolved thread ids from review markers while preserving other fields", async () => {
    const key = { owner: "o", repo: "r", pr: 7 };
    await markReviewInlineThreads(
      key,
      "PRR_1",
      ["PRRT_3", "PRRT_1", "PRRT_2"],
      ["PRRT_3", "PRRT_1", "PRRT_2"],
    );
    await markReviewInlineThreads(key, "PRR_2", ["PRRT_4"], ["PRRT_4"]);

    await pruneResolvedReviewThreads(key, ["PRRT_1"]);
    const afterFirst = await loadSeenMap(key);
    expect(afterFirst.get("PRR_1")?.unresolvedInlineThreadIds).toEqual(["PRRT_2", "PRRT_3"]);
    expect(afterFirst.get("PRR_1")?.inlineThreadIds).toEqual(["PRRT_1", "PRRT_2", "PRRT_3"]);
    expect(afterFirst.get("PRR_2")?.unresolvedInlineThreadIds).toEqual(["PRRT_4"]);

    await pruneResolvedReviewThreads(key, ["PRRT_2", "PRRT_3"]);
    const afterSecond = await loadSeenMap(key);
    expect(afterSecond.get("PRR_1")?.unresolvedInlineThreadIds).toEqual([]);
  });
});
