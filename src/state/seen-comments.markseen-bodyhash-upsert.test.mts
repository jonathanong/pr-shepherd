import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { markReplySeen, markSeen, readSeenMarker, hashBody } from "./seen-comments.mts";

let testStateDir: string;

const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };
const testId = "PRRT_kwDOTest123";

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-seen-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("markSeen — bodyHash upsert", () => {
  it("writes bodyHash on first call", async () => {
    await markSeen(testKey, testId, "hello");
    const marker = await readSeenMarker(testKey, testId);
    expect(marker?.bodyHash).toBe(hashBody("hello"));
  });

  it("preserves original seenAt when updating hash", async () => {
    await markSeen(testKey, testId, "original");
    const first = await readSeenMarker(testKey, testId);
    const originalSeenAt = first!.seenAt;

    await markSeen(testKey, testId, "edited body");
    const second = await readSeenMarker(testKey, testId);
    expect(second!.seenAt).toBe(originalSeenAt);
    expect(second!.bodyHash).toBe(hashBody("edited body"));
  });

  it("is no-op when body is unchanged", async () => {
    await markSeen(testKey, testId, "stable body");
    const first = await readSeenMarker(testKey, testId);

    await markSeen(testKey, testId, "stable body");
    const second = await readSeenMarker(testKey, testId);
    // seenAt stays the same (no write happened)
    expect(second!.seenAt).toBe(first!.seenAt);
  });

  it("writes previous and reply hashes for thread replies", async () => {
    await markReplySeen(
      testKey,
      testId,
      "reviewer body",
      "reviewer body\n\n--- thread comment ---\n\nshepherd reply",
      "shepherd reply",
    );

    const marker = await readSeenMarker(testKey, testId);
    expect(marker?.bodyHash).toBe(
      hashBody("reviewer body\n\n--- thread comment ---\n\nshepherd reply"),
    );
    expect(marker?.previousBodyHash).toBe(hashBody("reviewer body"));
    expect(marker?.replyBodyHash).toBe(hashBody("shepherd reply"));
  });
});
