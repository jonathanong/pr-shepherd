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

describe("loadSeenMap", () => {
  it("returns empty Map when directory does not exist", async () => {
    const map = await loadSeenMap(testKey);
    expect(map.size).toBe(0);
  });

  it("returns Map with full marker data", async () => {
    await markSeen(testKey, testId, "body text");
    const map = await loadSeenMap(testKey);
    expect(map.has(testId)).toBe(true);
    const marker = map.get(testId);
    expect(typeof marker!.seenAt).toBe("number");
    expect(marker!.bodyHash).toBe(hashBody("body text"));
  });
});
