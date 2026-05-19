import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { markSeen, loadSeenMap, hashBody } from "./seen-comments.mts";

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

  it("hash-based marker (with id field) wins over legacy marker on the same key", async () => {
    // After the hash-based filename migration, a legacy <id>.json file may
    // still exist alongside the new <hash>.json file. Both map to the same key
    // but the legacy file may have a stale bodyHash. The hash-based entry must
    // always win so the stale legacy file cannot re-surface the item.
    const id = "PRRT_kwDOTest123";
    const hash = createHash("sha256").update(id, "utf8").digest("hex");
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr), "seen");
    await mkdir(dir, { recursive: true });
    // Legacy file with stale hash.
    await writeFile(
      join(dir, `${id}.json`),
      JSON.stringify({ seenAt: 1000, bodyHash: "stale" }),
      "utf8",
    );
    // Hash-based file with current hash.
    await writeFile(
      join(dir, `${hash}.json`),
      JSON.stringify({ seenAt: 2000, bodyHash: "current", id }),
      "utf8",
    );
    const map = await loadSeenMap({ ...testKey });
    // The hash-based entry should win.
    expect(map.get(id)!.bodyHash).toBe("current");
    expect(map.get(id)!.seenAt).toBe(2000);
  });

  it("falls back to filename stem as key when marker has no id field (legacy format)", async () => {
    // Legacy markers written before the id field was added use the filename stem as key.
    const legacyId = "PRRT_kwDOLegacy123";
    const hash = createHash("sha256").update(legacyId, "utf8").digest("hex");
    const dir = join(testStateDir, `${testKey.owner}-${testKey.repo}`, String(testKey.pr), "seen");
    await mkdir(dir, { recursive: true });
    // Write a legacy-format file (no id field) at the hash-based path.
    await writeFile(
      join(dir, `${hash}.json`),
      JSON.stringify({ seenAt: 1234, bodyHash: "abc" }),
      "utf8",
    );
    const map = await loadSeenMap(testKey);
    // The key should be the hash stem (legacy fallback), not the original ID.
    expect(map.has(hash)).toBe(true);
    expect(map.get(hash)!.seenAt).toBe(1234);
  });

  it("maps both IDs independently when they differ only in case — no collision on case-insensitive FS", async () => {
    // GitHub base64 IDs can produce pairs like `ChG7F` vs `ChG7f` that differ
    // only in case. On macOS APFS (case-insensitive) these would map to the
    // same filename if we used the raw ID; using a SHA-256 hash gives distinct
    // files so each gets its own seen-marker.
    const idUpper = "PRRT_kwDOSGizTs6ChG7F";
    const idLower = "PRRT_kwDOSGizTs6ChG7f";
    await markSeen(testKey, idUpper, "upper body");
    await markSeen(testKey, idLower, "lower body");

    // Verify the on-disk filenames are SHA-256 hashes (64 hex chars), not raw
    // IDs. This catches the regression on case-sensitive filesystems too: if
    // markSeen used raw IDs, the two files would exist on Linux but share a
    // name on macOS; the SHA-256 path produces two distinct 64-hex filenames
    // regardless of OS.
    const seenDir = join(
      testStateDir,
      `${testKey.owner}-${testKey.repo}`,
      String(testKey.pr),
      "seen",
    );
    const files = (await readdir(seenDir)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(2);
    const hexRe = /^[0-9a-f]{64}\.json$/;
    expect(files.every((f) => hexRe.test(f))).toBe(true);
    expect(files[0]).not.toBe(files[1]);

    const map = await loadSeenMap(testKey);
    expect(map.has(idUpper)).toBe(true);
    expect(map.has(idLower)).toBe(true);
    expect(map.get(idUpper)!.bodyHash).toBe(hashBody("upper body"));
    expect(map.get(idLower)!.bodyHash).toBe(hashBody("lower body"));
  });
});
