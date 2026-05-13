// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  hasSeen,
  markSeen,
  readSeenMarker,
  loadSeenSet,
  loadSeenMap,
  classifyItem,
  hashBody,
} from "./seen-comments.mts";

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

describe("markSeen — fire and forget", () => {
  it("does not throw when the state dir is not writable", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    await expect(
      markSeen({ owner: "a", repo: "b", pr: 1 }, testId, "body"),
    ).resolves.toBeUndefined();
  });

  it("cleans up temp file when rename fails (directory at destination)", async () => {
    // Place a directory at the marker path so rename(tmp, path) throws EISDIR.
    const seenDir = join(
      testStateDir,
      `${testKey.owner}-${testKey.repo}`,
      String(testKey.pr),
      "seen",
    );
    const markerPath = join(seenDir, `${testId}.json`);
    await mkdir(markerPath, { recursive: true }); // directory where file would go
    await expect(markSeen(testKey, testId, "body")).resolves.toBeUndefined();
    // No .tmp files should remain in the seen dir.
    const remaining = await readdir(seenDir);
    expect(remaining.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });
});
