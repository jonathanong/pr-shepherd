import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  idToFilename,
  testKey,
  testId,
  testStateDir,
  registerHooks,
} from "../../test-helpers/state/seen-comments.test-support.mts";
import { markReviewInlineThreads, markSeen, readSeenMarker } from "./seen-comments.mts";

registerHooks();

describe("readSeenMarker", () => {
  it("returns null when no file exists", async () => {
    expect(await readSeenMarker(testKey, testId)).toBeNull();
  });

  it("returns the written marker with seenAt field", async () => {
    const before = Date.now();
    await markSeen(testKey, testId, "test body");
    const marker = await readSeenMarker(testKey, testId);
    expect(marker).not.toBeNull();
    expect(typeof marker!.seenAt).toBe("number");
    expect(marker!.seenAt).toBeGreaterThanOrEqual(before);
  });

  it("stores review inline-thread ids without replacing body metadata", async () => {
    await markSeen(testKey, "PRR_PARENT", "review body");
    const before = await readSeenMarker(testKey, "PRR_PARENT");

    await markReviewInlineThreads(testKey, "PRR_PARENT", ["thread-b", "thread-a", "thread-a"]);

    const marker = await readSeenMarker(testKey, "PRR_PARENT");
    expect(marker?.seenAt).toBe(before?.seenAt);
    expect(marker?.bodyHash).toBe(before?.bodyHash);
    expect(marker?.inlineThreadIds).toEqual(["thread-a", "thread-b"]);
  });

  it("tolerates unknown keys — open schema", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr), "seen");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, idToFilename(testId)),
      JSON.stringify({ seenAt: 1000, classification: "Acknowledged", extra: true }),
      "utf8",
    );
    const marker = await readSeenMarker(testKey, testId);
    expect(marker?.seenAt).toBe(1000);
    expect((marker as Record<string, unknown>)["classification"]).toBe("Acknowledged");
  });

  it("returns null on invalid JSON", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr), "seen");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, idToFilename(testId)), "not json", "utf8");
    expect(await readSeenMarker(testKey, testId)).toBeNull();
  });
});
