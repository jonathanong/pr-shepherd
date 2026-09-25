import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readStallState, writeStallState, clearStallState } from "./iterate-stall.mts";

type StallState = Parameters<typeof writeStallState>[1];

let testStateDir: string;

const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stall-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("readStallState — miss", () => {
  it("returns null when no file exists", async () => {
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
  });
});

describe("readStallState — invalid JSON", () => {
  it("returns null instead of throwing", async () => {
    const dir = join(testStateDir, testKey.owner, testKey.repo, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "iterate-stall.json"), "not json", "utf8");
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
  });
});

describe("readStallState — invalid shape (valid JSON but wrong types)", () => {
  it("returns null when fingerprint is missing", async () => {
    const dir = join(testStateDir, testKey.owner, testKey.repo, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "iterate-stall.json"), JSON.stringify({ firstSeenAt: 1000 }), "utf8");
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
  });

  it("returns null when firstSeenAt is not a finite number", async () => {
    const dir = join(testStateDir, testKey.owner, testKey.repo, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "iterate-stall.json"),
      JSON.stringify({ fingerprint: "abc", firstSeenAt: "not-a-number" }),
      "utf8",
    );
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
  });

  it("returns null when firstSeenAt is NaN", async () => {
    const dir = join(testStateDir, testKey.owner, testKey.repo, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "iterate-stall.json"),
      JSON.stringify({ fingerprint: "abc", firstSeenAt: null }),
      "utf8",
    );
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
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
    expect(result).toEqual({ ok: true, state });
  });
});

describe("readStallState — default state dir", () => {
  it("returns null (no file) when PR_SHEPHERD_STATE_DIR is unset", async () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    const result = await readStallState(testKey);
    expect(result).toEqual({ ok: true, state: null });
  });
});

describe("readStallState — unsafe key segments", () => {
  it("reports a persistence failure when owner contains a slash", async () => {
    const result = await readStallState({ owner: "a/b", repo: "repo", pr: 1 });
    expect(result.ok).toBe(false);
  });

  it("reports a persistence failure when repo contains a space", async () => {
    const result = await readStallState({ owner: "owner", repo: "my repo", pr: 1 });
    expect(result.ok).toBe(false);
  });

  it("reports a persistence failure when pr is not a positive integer", async () => {
    const result = await readStallState({ owner: "owner", repo: "repo", pr: -1 });
    expect(result.ok).toBe(false);
  });
});

describe("writeStallState — unwritable state dir", () => {
  it("reports the failure instead of swallowing it", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    const result = await writeStallState(
      { owner: "a", repo: "b", pr: 1 },
      { fingerprint: "x", firstSeenAt: 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ENOTDIR");
  });

  it("reports a read failure when the state dir is a file", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    const result = await readStallState({ owner: "a", repo: "b", pr: 1 });
    expect(result.ok).toBe(false);
  });
});

describe("clearStallState", () => {
  it("removes an existing stall state file", async () => {
    const state: StallState = { fingerprint: "abc", firstSeenAt: 1700000000 };
    await writeStallState(testKey, state);
    expect(await readStallState(testKey)).toEqual({ ok: true, state });
    await clearStallState(testKey);
    expect(await readStallState(testKey)).toEqual({ ok: true, state: null });
  });

  it("does not throw when no file exists", async () => {
    await expect(clearStallState(testKey)).resolves.toBeUndefined();
  });
});
