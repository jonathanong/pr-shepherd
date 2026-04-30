import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
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

describe("hasSeen — miss", () => {
  it("returns false when no marker file exists", async () => {
    expect(await hasSeen(testKey, testId)).toBe(false);
  });
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
      join(dir, `${testId}.json`),
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
    await writeFile(join(dir, `${testId}.json`), "not json", "utf8");
    expect(await readSeenMarker(testKey, testId)).toBeNull();
  });
});

describe("hasSeen — default state dir", () => {
  it("returns false (no file) when PR_SHEPHERD_STATE_DIR is unset", async () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    expect(await hasSeen(testKey, testId)).toBe(false);
  });
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
