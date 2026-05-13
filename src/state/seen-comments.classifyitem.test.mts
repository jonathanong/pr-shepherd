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

describe("classifyItem", () => {
  it("returns 'new' when id not in map", () => {
    const map = new Map<string, { seenAt: number; [k: string]: unknown }>();
    expect(classifyItem("id1", "body", map)).toBe("new");
  });

  it("returns 'unchanged' when hash matches", () => {
    const map = new Map([["id1", { seenAt: 1000, bodyHash: hashBody("body") }]]);
    expect(classifyItem("id1", "body", map)).toBe("unchanged");
  });

  it("returns 'edited' when stored hash differs", () => {
    const map = new Map([["id1", { seenAt: 1000, bodyHash: hashBody("old body") }]]);
    expect(classifyItem("id1", "new body", map)).toBe("edited");
  });

  it("returns 'unchanged' for legacy marker without bodyHash", () => {
    const map = new Map([["id1", { seenAt: 1000 }]]);
    expect(classifyItem("id1", "any body", map)).toBe("unchanged");
  });
});
