import { afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

export function writeRc(contents: string): void {
  writeFileSync(join(tmpDir, RC), contents);
}

export function removeRc(): void {
  rmSync(join(tmpDir, RC));
}

export function tmpPath(...segments: string[]): string {
  return join(tmpDir, ...segments);
}
