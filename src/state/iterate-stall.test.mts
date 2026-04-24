import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readStallState, writeStallState, type StallState } from "./iterate-stall.mts";

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
    expect(result).toBeNull();
  });
});

describe("readStallState — invalid JSON", () => {
  it("returns null instead of throwing", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "iterate-stall.json"), "not json", "utf8");
    const result = await readStallState(testKey);
    expect(result).toBeNull();
  });
});

describe("readStallState — invalid shape (valid JSON but wrong types)", () => {
  it("returns null when fingerprint is missing", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "iterate-stall.json"), JSON.stringify({ firstSeenAt: 1000 }), "utf8");
    const result = await readStallState(testKey);
    expect(result).toBeNull();
  });

  it("returns null when firstSeenAt is not a finite number", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "iterate-stall.json"),
      JSON.stringify({ fingerprint: "abc", firstSeenAt: "not-a-number" }),
      "utf8",
    );
    const result = await readStallState(testKey);
    expect(result).toBeNull();
  });

  it("returns null when firstSeenAt is NaN", async () => {
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "iterate-stall.json"),
      JSON.stringify({ fingerprint: "abc", firstSeenAt: null }),
      "utf8",
    );
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

describe("readStallState — default state dir", () => {
  it("returns null (no file) when PR_SHEPHERD_STATE_DIR is unset", async () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    const result = await readStallState(testKey);
    expect(result).toBeNull();
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
  it("does not throw when the state dir is not writable", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    await expect(
      writeStallState({ owner: "a", repo: "b", pr: 1 }, { fingerprint: "x", firstSeenAt: 1 }),
    ).resolves.toBeUndefined();
  });
});
