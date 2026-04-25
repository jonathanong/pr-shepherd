import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { hasSeen, markSeen, readSeenMarker } from "./seen-comments.mts";

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
    await markSeen(testKey, testId);
    expect(await hasSeen(testKey, testId)).toBe(true);
  });

  it("is idempotent — double-mark does not throw", async () => {
    await markSeen(testKey, testId);
    await markSeen(testKey, testId);
    expect(await hasSeen(testKey, testId)).toBe(true);
  });
});

describe("readSeenMarker", () => {
  it("returns null when no file exists", async () => {
    expect(await readSeenMarker(testKey, testId)).toBeNull();
  });

  it("returns the written marker with seenAt field", async () => {
    const before = Date.now();
    await markSeen(testKey, testId);
    const marker = await readSeenMarker(testKey, testId);
    expect(marker).not.toBeNull();
    expect(typeof marker!.seenAt).toBe("number");
    expect(marker!.seenAt).toBeGreaterThanOrEqual(before);
  });

  it("tolerates unknown keys — open schema", async () => {
    const dir = join(
      testStateDir,
      `${testKey.owner}-${testKey.repo}`,
      String(testKey.pr),
      "seen",
    );
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
    const dir = join(
      testStateDir,
      `${testKey.owner}-${testKey.repo}`,
      String(testKey.pr),
      "seen",
    );
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
    await expect(markSeen(testKey, "bad id")).resolves.toBeUndefined();
  });
});

describe("markSeen — fire and forget", () => {
  it("does not throw when the state dir is not writable", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    await expect(markSeen({ owner: "a", repo: "b", pr: 1 }, testId)).resolves.toBeUndefined();
  });
});
