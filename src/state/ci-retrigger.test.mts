import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCiRetrigger, sameCiRetrigger, writeCiRetrigger } from "./ci-retrigger.mts";

const key = { owner: "acme", repo: "widgets", pr: 12 };

describe("ci retrigger marker", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-ci-retrigger-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("matches the same head and context set regardless of order", async () => {
    await writeCiRetrigger(key, { headSha: "abc", contexts: ["tests", "build"] });
    const stored = await readCiRetrigger(key);
    expect(sameCiRetrigger(stored, "abc", ["build", "tests"])).toBe(true);
    expect(sameCiRetrigger(stored, "def", ["build", "tests"])).toBe(false);
    expect(sameCiRetrigger(stored, "abc", ["build"])).toBe(false);
  });

  it("treats a missing or malformed marker as not retriggered", async () => {
    expect(sameCiRetrigger(await readCiRetrigger(key), "abc", ["build"])).toBe(false);
  });
});
