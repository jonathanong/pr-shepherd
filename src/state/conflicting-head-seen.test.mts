import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conflictingHeadFirstSeenUnix } from "./conflicting-head-seen.mts";

const key = { owner: "acme", repo: "widgets", pr: 12 };
const head = "a".repeat(40);

describe("conflictingHeadFirstSeenUnix", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-head-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("starts the grace at the first observation and keeps it for the same head", async () => {
    const first = await conflictingHeadFirstSeenUnix(key, head, 1_700_000_000_000);
    const again = await conflictingHeadFirstSeenUnix(key, head, 1_700_000_500_000);
    expect(first).toBe(1_700_000_000);
    expect(again).toBe(1_700_000_000);
  });

  it("restarts the grace when the head changes and replaces a malformed marker", async () => {
    await conflictingHeadFirstSeenUnix(key, head, 1_700_000_000_000);
    const reset = await conflictingHeadFirstSeenUnix(key, "b".repeat(40), 1_700_000_200_000);
    expect(reset).toBe(1_700_000_200);
    const path = join(dir, "acme", "widgets", "12", "conflicting-head.json");
    await writeFile(path, "{");
    const repaired = await conflictingHeadFirstSeenUnix(key, head, 1_700_000_300_000);
    expect(repaired).toBe(1_700_000_300);
  });

  it("returns undefined when the state directory cannot be written", async () => {
    const blocked = join(dir, "not-a-directory");
    await writeFile(blocked, "x");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocked;
    await expect(
      conflictingHeadFirstSeenUnix(key, head, 1_700_000_000_000),
    ).resolves.toBeUndefined();
  });

  it("ignores a marker whose timestamp is not finite", async () => {
    const path = join(dir, "acme", "widgets", "12");
    await mkdir(path, { recursive: true });
    await writeFile(
      join(path, "conflicting-head.json"),
      `{"headSha":${JSON.stringify(head)},"firstSeenAtUnix":1e309}`,
    );
    const seen = await conflictingHeadFirstSeenUnix(key, head, 1_700_000_400_000);
    expect(seen).toBe(1_700_000_400);
    await writeFile(join(path, "conflicting-head.json"), "null");
    await expect(conflictingHeadFirstSeenUnix(key, head, 1_700_000_500_000)).resolves.toBe(
      1_700_000_500,
    );
  });
});
