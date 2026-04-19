import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readFixAttempts, writeFixAttempts, type FixAttemptsState } from "./fix-attempts.mts";

let testCacheDir: string;

const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };

beforeEach(() => {
  testCacheDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-fix-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_CACHE_DIR"] = testCacheDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_CACHE_DIR"];
  await rm(testCacheDir, { recursive: true, force: true });
});

describe("readFixAttempts — miss", () => {
  it("returns null when no file exists", async () => {
    const result = await readFixAttempts(testKey);
    expect(result).toBeNull();
  });
});

describe("readFixAttempts — invalid JSON", () => {
  it("returns null instead of throwing", async () => {
    const dir = join(testCacheDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "fix-attempts.json"), "not json", "utf8");
    const result = await readFixAttempts(testKey);
    expect(result).toBeNull();
  });
});

describe("writeFixAttempts / readFixAttempts — round-trip", () => {
  it("returns the written state", async () => {
    const state: FixAttemptsState = {
      headSha: "abc123",
      threadAttempts: { "thread-1": 2, "thread-2": 1 },
    };
    await writeFixAttempts(testKey, state);
    const result = await readFixAttempts(testKey);
    expect(result).toEqual(state);
  });
});

describe("readFixAttempts — unsafe key segments", () => {
  it("returns null (does not throw) when owner contains a slash", async () => {
    // resolvePath throws, but readFixAttempts wraps in try-catch → null
    const result = await readFixAttempts({ owner: "a/b", repo: "repo", pr: 1 });
    expect(result).toBeNull();
  });

  it("returns null (does not throw) when repo contains a space", async () => {
    const result = await readFixAttempts({ owner: "owner", repo: "my repo", pr: 1 });
    expect(result).toBeNull();
  });
});

describe("writeFixAttempts — fire and forget", () => {
  it("does not throw when the cache dir is not writable", async () => {
    // Point to an impossible path (file exists where dir would be).
    const collision = join(testCacheDir, "collision");
    await mkdir(testCacheDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_CACHE_DIR"] = collision;
    await expect(
      writeFixAttempts({ owner: "a", repo: "b", pr: 1 }, { headSha: "sha", threadAttempts: {} }),
    ).resolves.toBeUndefined();
  });
});
