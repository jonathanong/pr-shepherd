import { describe, it, expect, afterEach, vi } from "vitest";
import { resolvePollMode } from "./poll-mode.mts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvePollMode", () => {
  it("resolves auto to poll outside a cloud session", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    expect(resolvePollMode(undefined, undefined)).toBe("poll");
    expect(resolvePollMode("auto", "event")).toBe("poll");
  });

  it("resolves auto to event in a cloud session", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(resolvePollMode(undefined, "auto")).toBe("event");
  });

  it("lets an explicit request win over config and environment", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(resolvePollMode("poll", "event")).toBe("poll");
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    expect(resolvePollMode("event", "poll")).toBe("event");
    expect(resolvePollMode(undefined, "event")).toBe("event");
  });
});
