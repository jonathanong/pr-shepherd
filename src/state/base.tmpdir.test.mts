import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

const savedPlatform = process.platform;
const savedStateDir = process.env["PR_SHEPHERD_STATE_DIR"];
const savedTmpdir = process.env["TMPDIR"];

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

async function loadResolveStateBase() {
  vi.resetModules();
  return (await import("./base.mts")).resolveStateBase;
}

beforeEach(() => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
});

afterEach(() => {
  setPlatform(savedPlatform);
  if (savedStateDir === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
  else process.env["PR_SHEPHERD_STATE_DIR"] = savedStateDir;
  if (savedTmpdir === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = savedTmpdir;
});

describe("resolveStateBase — default location", () => {
  it("follows $TMPDIR on macOS so sandboxed shells write to their own temp dir", async () => {
    setPlatform("darwin");
    process.env["TMPDIR"] = "/tmp/claude-501";
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(join("/tmp/claude-501", "pr-shepherd-state"));
  });

  it("honors PR_SHEPHERD_STATE_DIR only when non-empty", async () => {
    setPlatform("darwin");
    process.env["TMPDIR"] = "/tmp/claude-501";
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect((await loadResolveStateBase())()).toBe("/custom/state");

    process.env["PR_SHEPHERD_STATE_DIR"] = "";
    expect((await loadResolveStateBase())()).toBe(join("/tmp/claude-501", "pr-shepherd-state"));
  });
});
