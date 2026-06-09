import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readBotCrSeenState, writeBotCrSeenState, type BotCrSeenState } from "./bot-cr-seen.mts";

let testStateDir: string;
const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-bot-cr-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

function stateDir(key: { owner: string; repo: string; pr: number }): string {
  return join(testStateDir, `${key.owner}-${key.repo}`, String(key.pr));
}

describe("readBotCrSeenState — miss", () => {
  it("returns null when no file exists", async () => {
    expect(await readBotCrSeenState(testKey)).toBeNull();
  });
});

describe("readBotCrSeenState — invalid JSON", () => {
  it("returns null instead of throwing", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(join(stateDir(testKey), "bot-cr-seen.json"), "not json", "utf8");
    expect(await readBotCrSeenState(testKey)).toBeNull();
  });
});

describe("readBotCrSeenState — invalid shape", () => {
  it("returns null when reviews field is missing", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(join(stateDir(testKey), "bot-cr-seen.json"), JSON.stringify({}), "utf8");
    expect(await readBotCrSeenState(testKey)).toBeNull();
  });

  it("returns null when reviews is an array (not object)", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(
      join(stateDir(testKey), "bot-cr-seen.json"),
      JSON.stringify({ reviews: [] }),
      "utf8",
    );
    expect(await readBotCrSeenState(testKey)).toBeNull();
  });

  it("returns null when top-level is null", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(join(stateDir(testKey), "bot-cr-seen.json"), JSON.stringify(null), "utf8");
    expect(await readBotCrSeenState(testKey)).toBeNull();
  });

  it("skips entries with missing firstSeenAt", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(
      join(stateDir(testKey), "bot-cr-seen.json"),
      JSON.stringify({
        reviews: { A: { bodyHash: "abc" }, B: { firstSeenAt: 1000, bodyHash: "x" } },
      }),
      "utf8",
    );
    const result = await readBotCrSeenState(testKey);
    expect(result).toEqual({ reviews: { B: { firstSeenAt: 1000, bodyHash: "x" } } });
  });

  it("skips entries with non-finite firstSeenAt or non-string bodyHash", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(
      join(stateDir(testKey), "bot-cr-seen.json"),
      JSON.stringify({
        reviews: {
          NAN: { firstSeenAt: NaN, bodyHash: "x" },
          NUM_HASH: { firstSeenAt: 5, bodyHash: 42 },
          OK: { firstSeenAt: 10, bodyHash: "h" },
        },
      }),
      "utf8",
    );
    const result = await readBotCrSeenState(testKey);
    expect(result).toEqual({ reviews: { OK: { firstSeenAt: 10, bodyHash: "h" } } });
  });

  it("skips null entry values", async () => {
    await mkdir(stateDir(testKey), { recursive: true });
    await writeFile(
      join(stateDir(testKey), "bot-cr-seen.json"),
      JSON.stringify({ reviews: { NULL: null, OK: { firstSeenAt: 1, bodyHash: "h" } } }),
      "utf8",
    );
    const result = await readBotCrSeenState(testKey);
    expect(result).toEqual({ reviews: { OK: { firstSeenAt: 1, bodyHash: "h" } } });
  });
});

describe("writeBotCrSeenState / readBotCrSeenState — round trip", () => {
  it("returns the written state", async () => {
    const state: BotCrSeenState = {
      reviews: { PRR_x: { firstSeenAt: 1_700_000_000, bodyHash: "hash" } },
    };
    await writeBotCrSeenState(testKey, state);
    expect(await readBotCrSeenState(testKey)).toEqual(state);
  });
});

describe("writeBotCrSeenState — fire and forget", () => {
  it("does not throw when the state dir is not writable", async () => {
    const collision = join(testStateDir, "collision");
    await mkdir(testStateDir, { recursive: true });
    await writeFile(collision, "blocker", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = collision;
    await expect(
      writeBotCrSeenState(
        { owner: "a", repo: "b", pr: 1 },
        { reviews: { X: { firstSeenAt: 1, bodyHash: "h" } } },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("readBotCrSeenState — unsafe key segments", () => {
  it("returns null (does not throw) when owner contains a slash", async () => {
    expect(await readBotCrSeenState({ owner: "a/b", repo: "repo", pr: 1 })).toBeNull();
  });
});
