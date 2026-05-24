import { describe, it, expect } from "vitest";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  idToFilename,
  testKey,
  testId,
  testStateDir,
  registerHooks,
} from "../../test-helpers/state/seen-comments.test-support.mts";
import { markSeen } from "./seen-comments.mts";

registerHooks();

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
    // Place a directory at the hash-based marker path so rename(tmp, path) throws EISDIR.
    const seenDir = join(
      testStateDir,
      `${testKey.owner}-${testKey.repo}`,
      String(testKey.pr),
      "seen",
    );
    const markerPath = join(seenDir, idToFilename(testId));
    await mkdir(markerPath, { recursive: true }); // directory where file would go
    await expect(markSeen(testKey, testId, "body")).resolves.toBeUndefined();
    // No .tmp files should remain in the seen dir.
    const remaining = await readdir(seenDir);
    expect(remaining.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });
});
