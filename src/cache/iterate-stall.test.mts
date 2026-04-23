import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readStallState, writeStallState, type StallState } from "./iterate-stall.mts";

let testCacheDir: string;

const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };

beforeEach(() => {
  testCacheDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stall-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_CACHE_DIR"] = testCacheDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_CACHE_DIR"];
  await rm(testCacheDir, { recursive: true, force: true });
});

describe("readStallState — miss", () => {
  it("returns null when no file exists", async () => {
    const result = await readStallState(testKey);
    expect(result).toBeNull();
  });
});

describe("readStallState — invalid JSON", () => {
  it("returns null instead of throwing", async () => {
    const dir = join(testCacheDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "iterate-stall.json"), "not json", "utf8");
    const result = await readStallState(testKey);
    expect(result).toBeNull();
  });
});

describe("writeStallState / readStallState — round-trip", () => {
  it("returns the written state", async () => {
    const state: StallState = {
      fingerprint: "abc123",
      firstSeenAt: 1700000000,
    };
    await writeStallState(testKey, state);
    const result = await readStallState(testKey);
    expect(result).toEqual(state);
  });
});

describe("readStallState — unsafe key segments", () => {
  it("returns null (does not throw) when owner contains a slash", async () => {
    const result = await readStallState({ owner: "a/b", repo: "repo", pr: 1 });
    expect(result).toBeNull();
  });

  it("returns null (does not throw) when repo contains a space", async () => {
    const result = await readStallState({ owner: "owner", repo: "my repo", pr: 1 });
    expect(result).toBeNull();
  });
});

describe("writeStallState — fire and forget", () => {
  it("does not throw when the cache dir is not writable", async () => {
    const collision = join(testCacheDir, "collision");
    await mkdir(testCacheDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_CACHE_DIR"] = collision;
    await expect(
      writeStallState({ owner: "a", repo: "b", pr: 1 }, { fingerprint: "x", firstSeenAt: 1 }),
    ).resolves.toBeUndefined();
  });
});
