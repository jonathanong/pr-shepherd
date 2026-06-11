import { describe, it, expect } from "vitest";
import { registerHooks, mockGraphql } from "../../test-helpers/comments/resolve.test-support.mts";
import { autoMinimizeComments, autoResolveOutdated } from "./resolve.mts";

registerHooks();

describe("autoResolveOutdated", () => {
  it("returns resolved IDs and empty errors on success", async () => {
    const ids = ["t-1", "t-2", "t-3"];
    const { resolved, errors } = await autoResolveOutdated(ids);
    expect(resolved).toEqual(ids);
    expect(errors).toHaveLength(0);
  });

  it("splits mutations into 10-op graphql calls", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `t-${i}`);
    await autoResolveOutdated(ids);
    expect(mockGraphql).toHaveBeenCalledTimes(3);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("mutation BulkApply");
    for (const id of ids.slice(0, 10)) {
      expect(doc).toContain(id);
    }
    expect(doc).not.toContain("t-10");
  });
});

describe("autoMinimizeComments", () => {
  it("returns minimized IDs and empty errors on success", async () => {
    const ids = ["c-1", "PRR_2"];
    const { minimized, errors } = await autoMinimizeComments(ids);
    expect(minimized).toEqual(ids);
    expect(errors).toHaveLength(0);
  });

  it("splits mutations into 10-op graphql calls", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `c-${i}`);
    await autoMinimizeComments(ids);
    expect(mockGraphql).toHaveBeenCalledTimes(3);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("mutation BulkApply");
    expect(doc).toContain("minimizeComment");
    for (const id of ids.slice(0, 10)) {
      expect(doc).toContain(id);
    }
    expect(doc).not.toContain("c-10");
  });
});
