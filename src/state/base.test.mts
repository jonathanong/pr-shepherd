import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStateBase } from "./base.mts";

describe("resolveStateBase", () => {
  const saved = process.env["PR_SHEPHERD_STATE_DIR"];
  afterEach(() => {
    if (saved === undefined) {
      delete process.env["PR_SHEPHERD_STATE_DIR"];
    } else {
      process.env["PR_SHEPHERD_STATE_DIR"] = saved;
    }
  });

  it("returns default when env var not set", () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    expect(resolveStateBase()).toBe(join(tmpdir(), "pr-shepherd-state"));
  });

  it("returns env var value when set", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveStateBase()).toBe("/custom/state");
  });

  it("is idempotent for the same env", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveStateBase()).toBe(resolveStateBase());
  });
});
