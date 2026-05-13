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

describe("hasSeen / markSeen — unsafe key segments", () => {
  it("hasSeen returns false (does not throw) when owner contains a slash", async () => {
    expect(await hasSeen({ owner: "a/b", repo: "repo", pr: 1 }, testId)).toBe(false);
  });

  it("hasSeen returns false when id contains a space", async () => {
    expect(await hasSeen(testKey, "bad id")).toBe(false);
  });

  it("markSeen does not throw when id is unsafe", async () => {
    await expect(markSeen(testKey, "bad id", "body")).resolves.toBeUndefined();
  });
});
