import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanGhCacheForRateLimit } from "./gh-cache.mts";

const HOUR = 3_600_000;
const POISON =
  'HTTP/2.0 200 OK\r\n\r\n{"errors":[{"type":"RATE_LIMIT","code":"graphql_rate_limit"}]}';
let root: string;
let env: NodeJS.ProcessEnv;

function entry(name: string, body: string, ageMs = 0): string {
  const dir = join(root, "gh", name.slice(0, 2), name.slice(2, 4));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, body);
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(file, when, when);
  return file;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gh-cache-"));
  env = { XDG_CACHE_HOME: root };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("scanGhCacheForRateLimit", () => {
  it("finds a fresh small RATE_LIMIT entry and reports mtime + 24h", () => {
    const file = entry("aabbccdd", POISON, HOUR);
    const found = scanGhCacheForRateLimit(Date.now(), env);
    expect(found?.paths).toEqual([file]);
    expect(Math.abs(Date.parse(found!.expiresAt) - (Date.now() + 23 * HOUR))).toBeLessThan(5000);
  });

  it("ignores old, large, and unrelated entries", () => {
    entry("aa000001", POISON, 25 * HOUR);
    entry("aa000002", POISON + " ".repeat(5000));
    entry("aa000003", '{"data":{}}');
    expect(scanGhCacheForRateLimit(Date.now(), env)).toBeUndefined();
  });

  it("returns nothing when the cache dir is missing", () => {
    expect(scanGhCacheForRateLimit(Date.now(), { XDG_CACHE_HOME: join(root, "nope") })).toBe(
      undefined,
    );
  });

  it("stops descending past the depth cap", () => {
    const deep = join(root, "gh", "a", "b", "c", "d", "e");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "f"), POISON);
    expect(scanGhCacheForRateLimit(Date.now(), env)).toBeUndefined();
  });

  it("uses process.env by default", () => {
    entry("aabbccdd", POISON);
    const previous = process.env["XDG_CACHE_HOME"];
    process.env["XDG_CACHE_HOME"] = root;
    try {
      expect(scanGhCacheForRateLimit()?.paths).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env["XDG_CACHE_HOME"];
      else process.env["XDG_CACHE_HOME"] = previous;
    }
  });
});

describe("cache directory resolution", () => {
  it("uses LocalAppData\\GitHub CLI on Windows", () => {
    const dir = join(root, "GitHub CLI", "aa", "bb");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cc"), POISON);
    expect(scanGhCacheForRateLimit(Date.now(), { LocalAppData: root }, "win32")?.paths).toEqual([
      join(dir, "cc"),
    ]);
  });

  it("falls back to ~/.cache/gh without throwing", () => {
    expect(() => scanGhCacheForRateLimit(Date.now(), {})).not.toThrow();
  });
});
