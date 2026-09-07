import { describe, expect, it } from "vitest";
import {
  hasMultiCommentThreads,
  rulesComplete,
  stackKey,
  threadCommentRevisions,
} from "./fingerprint-fields.mts";

describe("fingerprint-fields", () => {
  it("encodes stack identity and treats missing stacks as empty", () => {
    expect(stackKey({})).toBe("");
    expect(
      stackKey({
        stack: { number: 7, size: 3, baseRefName: "stack/7/1" },
        stackEntry: { position: 2 },
      }),
    ).toBe("7:3:2:stack/7/1");
    expect(stackKey({ stack: { number: 1, size: 1, baseRefName: "main" } })).toBe("1:1:0:main");
  });

  it("treats extra merge-policy rule pages as incomplete", () => {
    expect(rulesComplete(null)).toBe(true);
    expect(rulesComplete({ rules: {} })).toBe(true);
    expect(rulesComplete({ rules: { pageInfo: { hasNextPage: false } } })).toBe(true);
    expect(rulesComplete({ rules: { pageInfo: { hasNextPage: true } } })).toBe(false);
  });

  it("fingerprints the latest thread comment revision", () => {
    expect(threadCommentRevisions([{ id: "t1" }])).toBe("t1::");
    expect(
      threadCommentRevisions([
        {
          id: "t1",
          comments: { nodes: [{ id: "c1", updatedAt: "2026-09-06T00:00:00Z" }] },
        },
      ]),
    ).toBe("t1:c1:2026-09-06T00:00:00Z");
  });

  it("detects threads with more than one comment", () => {
    expect(hasMultiCommentThreads([{ comments: { totalCount: 1 } }])).toBe(false);
    expect(hasMultiCommentThreads([{ comments: { totalCount: 2 } }])).toBe(true);
  });
});
