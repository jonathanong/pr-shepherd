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

describe("loadSeenSet", () => {
  it("returns empty Set when directory does not exist", async () => {
    const set = await loadSeenSet(testKey);
    expect(set.size).toBe(0);
  });

  it("returns Set containing marked IDs", async () => {
    const id2 = "PRRT_kwDOTest456";
    await markSeen(testKey, testId, "test body");
    await markSeen(testKey, id2, "test body 2");
    const set = await loadSeenSet(testKey);
    expect(set.has(testId)).toBe(true);
    expect(set.has(id2)).toBe(true);
    expect(set.size).toBe(2);
  });

  it("ignores non-.json files in the seen directory", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr), "seen");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "noise.txt"), "", "utf8");
    await markSeen(testKey, testId, "test body");
    const set = await loadSeenSet(testKey);
    expect(set.has(testId)).toBe(true);
    expect(set.has("noise.txt")).toBe(false);
    expect(set.size).toBe(1);
  });
});
