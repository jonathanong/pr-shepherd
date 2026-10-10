import { describe, expect, it } from "vitest";
import {
  currentRestConditionalKey,
  recordRestConditionalRead,
  restSnapshotState,
  withRestConditionalScope,
} from "./rest-conditional-scope.mts";

const key = { owner: "o", repo: "r", pr: 1 };

describe("REST conditional scope", () => {
  it("is inert outside a scope", () => {
    expect(currentRestConditionalKey()).toBeUndefined();
    expect(restSnapshotState()).toBeUndefined();
    expect(() => recordRestConditionalRead("/a", true, "e")).not.toThrow();
  });

  it("is not an all-304 snapshot before any read", async () => {
    await withRestConditionalScope(key, async () => {
      expect(currentRestConditionalKey()).toEqual(key);
      expect(restSnapshotState()?.allNotModified).toBe(false);
    });
  });

  it("reports an all-304 snapshot with an order-independent digest", async () => {
    const digest = async (order: string[]) =>
      withRestConditionalScope(key, async () => {
        for (const path of order) recordRestConditionalRead(path, true, `etag-${path}`);
        return restSnapshotState();
      });
    const first = await digest(["/a", "/b", "/c"]);
    const second = await digest(["/c", "/a", "/b"]);
    expect(first?.allNotModified).toBe(true);
    expect(first?.digest).toBe(second?.digest);
  });

  it("is not all-304 once any read returned a fresh body, and the digest tracks validators", async () => {
    const result = await withRestConditionalScope(key, async () => {
      recordRestConditionalRead("/a", true, "v1");
      const before = restSnapshotState();
      recordRestConditionalRead("/b", false, undefined);
      return { before, after: restSnapshotState() };
    });
    expect(result.before?.allNotModified).toBe(true);
    expect(result.after?.allNotModified).toBe(false);
    expect(result.after?.digest).not.toBe(result.before?.digest);
  });
});
