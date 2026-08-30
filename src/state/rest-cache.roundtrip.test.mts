import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { loadEtagEntry, storeEtagEntry, loadDerived, storeDerived } from "./rest-cache.mts";

let testStateDir: string;

const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-rest-cache-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("rest-cache — etag entries", () => {
  it("returns null when no entry exists", async () => {
    expect(await loadEtagEntry(testKey, "jobs-run-1-p1")).toBeNull();
  });

  it("round-trips a stored etag entry", async () => {
    await storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"abc"', body: { jobs: [1, 2] } });
    const entry = await loadEtagEntry(testKey, "jobs-run-1-p1");
    expect(entry).toMatchObject({
      kind: "etag",
      name: "jobs-run-1-p1",
      etag: 'W/"abc"',
      body: { jobs: [1, 2] },
    });
  });

  it("overwrites an existing entry on re-store", async () => {
    await storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"v1"', body: { jobs: [1] } });
    await storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"v2"', body: { jobs: [1, 2] } });
    const entry = await loadEtagEntry(testKey, "jobs-run-1-p1");
    expect(entry?.etag).toBe('W/"v2"');
    expect(entry?.body).toEqual({ jobs: [1, 2] });
  });

  it("keeps distinct names isolated from each other", async () => {
    await storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"a"', body: "a" });
    await storeEtagEntry(testKey, "jobs-run-2-p1", { etag: 'W/"b"', body: "b" });
    expect((await loadEtagEntry(testKey, "jobs-run-1-p1"))?.body).toBe("a");
    expect((await loadEtagEntry(testKey, "jobs-run-2-p1"))?.body).toBe("b");
  });

  it("returns null for a corrupt cache file", async () => {
    await storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"a"', body: "a" });
    const { writeFile, readdir } = await import("node:fs/promises");
    const dir = `${testStateDir}/test-owner-test-repo/123/rest-cache`;
    const [file] = await readdir(dir);
    await writeFile(`${dir}/${file}`, "not json", "utf8");
    expect(await loadEtagEntry(testKey, "jobs-run-1-p1")).toBeNull();
  });

  it("cleans up the temp file when rename fails (directory at destination)", async () => {
    // Place a directory at the hash-based cache path so rename(tmp, path) throws EISDIR.
    const dir = `${testStateDir}/test-owner-test-repo/123/rest-cache`;
    const hash = createHash("sha256").update("jobs-run-1-p1", "utf8").digest("hex");
    await mkdir(`${dir}/${hash}.json`, { recursive: true });

    await expect(
      storeEtagEntry(testKey, "jobs-run-1-p1", { etag: 'W/"a"', body: "a" }),
    ).resolves.toBeUndefined();

    const remaining = await readdir(dir);
    expect(remaining.filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });
});

describe("rest-cache — derived entries", () => {
  it("returns null when no entry exists", async () => {
    expect(await loadDerived(testKey, "joblog-1")).toBeNull();
  });

  it("round-trips a stored derived value, including null sentinels", async () => {
    await storeDerived(testKey, "joblog-1", "excerpt text");
    expect((await loadDerived<string>(testKey, "joblog-1"))?.value).toBe("excerpt text");

    await storeDerived<string | null>(testKey, "joblog-2", null);
    const entry = await loadDerived<string | null>(testKey, "joblog-2");
    expect(entry).not.toBeNull();
    expect(entry?.value).toBeNull();
  });

  it("does not conflate an etag entry with a derived entry sharing a name", async () => {
    await storeEtagEntry(testKey, "shared-name", { etag: 'W/"x"', body: "etag-body" });
    expect(await loadDerived(testKey, "shared-name")).toBeNull();
  });

  it("stores an optional headSha alongside the value", async () => {
    await storeDerived(testKey, "annotations-CR_1", [{ id: "a1" }], "sha123");
    const entry = await loadDerived<Array<{ id: string }>>(testKey, "annotations-CR_1");
    expect(entry?.headSha).toBe("sha123");
  });
});
