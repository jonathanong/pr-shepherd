import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { hasSeen, markSeen } from "./seen-comments.mts";

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

describe("markSeen / hasSeen — round-trip", () => {
  it("returns true after marking", async () => {
    await markSeen(testKey, testId, "test body");
    expect(await hasSeen(testKey, testId)).toBe(true);
  });

  it("is idempotent — double-mark does not throw", async () => {
    await markSeen(testKey, testId, "test body");
    await markSeen(testKey, testId, "test body");
    expect(await hasSeen(testKey, testId)).toBe(true);
  });
});
