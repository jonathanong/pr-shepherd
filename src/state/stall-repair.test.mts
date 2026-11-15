import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStallRepair, stallRepairMarkerPath, writeStallRepair } from "./stall-repair.mts";

const scope = "acme/widgets#1";
let root: string;
let originalTmpdir: string | undefined;

beforeEach(async () => {
  originalTmpdir = process.env["TMPDIR"];
  root = join(originalTmpdir ?? "/tmp", `shepherd-stall-repair-${randomBytes(4).toString("hex")}`);
  await mkdir(root, { recursive: true });
  process.env["TMPDIR"] = root;
  process.env["PR_SHEPHERD_STATE_DIR"] = join(root, "state");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  if (originalTmpdir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = originalTmpdir;
  await rm(root, { recursive: true, force: true });
});

describe("stall repair marker", () => {
  it("is absent until written, then matches only the same reason", async () => {
    await expect(readStallRepair(scope, "EACCES")).resolves.toBe(false);
    await expect(writeStallRepair(scope, "EACCES")).resolves.toBe(true);
    await expect(readStallRepair(scope, "EACCES")).resolves.toBe(true);
    await expect(readStallRepair(scope, "ENOSPC")).resolves.toBe(false);
    await expect(readStallRepair("acme/widgets#2", "EACCES")).resolves.toBe(false);
  });

  it("ignores the randomized temporary file name in the reason", async () => {
    const reason = (id: string) => `EROFS: open '/state/stall.json.${id}.tmp'`;
    await writeStallRepair(scope, reason("0b6f2f55-7c0e-4d58-9f9e-1f6b6a7d4c11"));
    await expect(
      readStallRepair(scope, reason("c1a3d2e4-5b6f-4a7c-8d9e-0f1a2b3c4d5e")),
    ).resolves.toBe(true);
  });

  it("expires after an hour", async () => {
    await writeStallRepair(scope, "EACCES");
    vi.setSystemTime(Date.now() + 3601 * 1000);
    await expect(readStallRepair(scope, "EACCES")).resolves.toBe(false);
  });

  it("keys the path by state base and scope inside the temp directory", () => {
    const first = stallRepairMarkerPath(scope);
    expect(dirname(first)).toBe(tmpdir());
    process.env["PR_SHEPHERD_STATE_DIR"] = join(root, "other");
    expect(stallRepairMarkerPath(scope)).not.toBe(first);
  });

  it("reports an unwritable temp directory", async () => {
    process.env["TMPDIR"] = join(root, "missing");
    await expect(writeStallRepair(scope, "EACCES")).resolves.toBe(false);
  });
});
