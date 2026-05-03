import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  __resetRunnerCache,
  buildPrShepherdCommand,
  parseCliRunner,
  renderShellCommand,
  resolveCliRunner,
} from "./runner.mts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "shepherd-runner-test-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRunnerCache();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function writePackage(body: Record<string, unknown> = {}, dir = tmpDir): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(body, null, 2));
}

describe("resolveCliRunner", () => {
  it("uses explicit runner config before package detection", () => {
    writePackage({ packageManager: "pnpm@10.0.0" });
    expect(resolveCliRunner("yarn", tmpDir)).toBe("yarn");
  });

  it("detects pnpm from packageManager", () => {
    writePackage({ packageManager: "pnpm@10.0.0" });
    expect(resolveCliRunner("auto", tmpDir)).toBe("pnpm");
  });

  it("detects yarn from packageManager", () => {
    writePackage({ packageManager: "yarn@4.0.0" });
    expect(resolveCliRunner("auto", tmpDir)).toBe("yarn");
  });

  it("detects package manager from lockfiles when packageManager is absent", () => {
    writePackage();
    writeFileSync(join(tmpDir, "pnpm-lock.yaml"), "");
    expect(resolveCliRunner("auto", tmpDir)).toBe("pnpm");

    const yarnDir = join(tmpDir, "yarn");
    mkdirSync(yarnDir);
    writePackage({}, yarnDir);
    writeFileSync(join(yarnDir, "yarn.lock"), "");
    expect(resolveCliRunner("auto", yarnDir)).toBe("yarn");
  });

  it("walks upward for monorepo package manager signals", () => {
    writePackage();
    writeFileSync(join(tmpDir, "pnpm-lock.yaml"), "");
    mkdirSync(join(tmpDir, ".git"));
    const workspacePackage = join(tmpDir, "packages", "app");
    mkdirSync(workspacePackage, { recursive: true });
    writePackage({}, workspacePackage);

    expect(resolveCliRunner("auto", workspacePackage)).toBe("pnpm");
  });

  it("does not inspect package manager signals outside the current repository", () => {
    writePackage();
    writeFileSync(join(tmpDir, "pnpm-lock.yaml"), "");
    const repo = join(tmpDir, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writePackage({}, repo);

    expect(resolveCliRunner("auto", repo)).toBe("npx");
  });

  it("does not consult home directory lockfiles when start dir has no signals", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "shepherd-runner-home-"));
    try {
      writeFileSync(join(fakeHome, "yarn.lock"), "");
      vi.stubEnv("HOME", fakeHome);

      const startDir = join(fakeHome, "projects", "my-project");
      mkdirSync(startDir, { recursive: true });

      expect(resolveCliRunner("auto", startDir)).toBe("npx");
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("reads signals at home when home is the repo root (dotfiles repo)", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "shepherd-runner-home-"));
    try {
      mkdirSync(join(fakeHome, ".git"));
      writeFileSync(join(fakeHome, "pnpm-lock.yaml"), "");
      vi.stubEnv("HOME", fakeHome);

      expect(resolveCliRunner("auto", fakeHome)).toBe("pnpm");
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("falls back to npx for npm or missing signals", () => {
    writePackage({ packageManager: "npm@11.0.0" });
    expect(resolveCliRunner("auto", tmpDir)).toBe("npx");

    const nested = join(tmpDir, "nested");
    mkdirSync(nested);
    expect(resolveCliRunner("auto", nested)).toBe("npx");
  });

  it("rejects unsupported config values", () => {
    expect(() => parseCliRunner("bun")).toThrow("cli.runner");
  });

  it("rejects non-string, non-undefined config values", () => {
    expect(() => parseCliRunner(true)).toThrow("cli.runner");
    expect(() => parseCliRunner(1)).toThrow("cli.runner");
    expect(() => parseCliRunner(null)).toThrow("cli.runner");
    expect(parseCliRunner(undefined)).toBe("auto");
  });
});

describe("buildPrShepherdCommand", () => {
  it("renders npx commands by default", () => {
    expect(buildPrShepherdCommand(["42"], { runner: "npx" })).toEqual({
      argv: ["npx", "pr-shepherd", "42"],
      text: "npx pr-shepherd 42",
    });
  });

  it("renders pnpm and yarn commands", () => {
    expect(buildPrShepherdCommand(["42"], { runner: "pnpm" }).text).toBe(
      "pnpm exec pr-shepherd 42",
    );
    expect(buildPrShepherdCommand(["42"], { runner: "yarn" }).text).toBe("yarn run pr-shepherd 42");
  });

  it("quotes shell placeholders and whitespace-bearing args", () => {
    expect(renderShellCommand(["--message", "$DISMISS_MESSAGE", "hello world"])).toBe(
      '--message "$DISMISS_MESSAGE" "hello world"',
    );
  });
});
