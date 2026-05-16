// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

function idToFilename(id: string): string {
  return createHash("sha256").update(id, "utf8").digest("hex") + ".json";
}
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
