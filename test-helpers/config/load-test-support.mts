import { afterEach, beforeEach, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RC = ".pr-shepherdrc.yml";
let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), "shepherd-load-test-"));
  vi.stubEnv("HOME", tmpDir);
  vi.stubEnv("USERPROFILE", tmpDir);
  vi.resetModules();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

export async function freshLoadConfig() {
  const mod = await import("../../src/config/load.mts");
  return mod.loadConfig;
}

/** Prepend `version: 1` unless the contents are empty or already set a top-level `version`. */
function versioned(contents: string): string {
  return contents === "" || /^version:/m.test(contents) ? contents : `version: 1\n${contents}`;
}

export function writeRc(contents: string): void {
  writeFileSync(join(tmpDir, RC), versioned(contents));
}

/** Write the rc file exactly as given, without the `version: 1` line. */
export function writeRawRc(contents: string): void {
  writeFileSync(join(tmpDir, RC), contents);
}

export function writeRcAt(relativeDir: string, contents: string): void {
  const dir = relativeDir === "" ? tmpDir : join(tmpDir, relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, RC), versioned(contents));
}

export function removeRc(): void {
  rmSync(join(tmpDir, RC));
}

/** Assert that loading the current tree fails as a config error naming every `fragment`. */
export async function expectConfigError(...fragments: string[]): Promise<string> {
  const loadConfig = await freshLoadConfig();
  let caught: unknown;
  try {
    loadConfig();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ name: "ShepherdError", exitCode: 78 });
  const message = (caught as Error).message;
  for (const fragment of fragments) expect(message).toContain(fragment);
  return message;
}

export function tmpPath(...segments: string[]): string {
  return join(tmpDir, ...segments);
}
