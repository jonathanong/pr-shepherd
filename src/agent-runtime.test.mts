import { describe, expect, it } from "vitest";

import { detectAgentRuntime } from "./agent-runtime.mts";

describe("detectAgentRuntime", () => {
  it("detects Codex from AGENT=codex", () => {
    expect(detectAgentRuntime({ AGENT: "codex" })).toBe("codex");
  });

  it("detects Codex from mixed-case AGENT with whitespace", () => {
    expect(detectAgentRuntime({ AGENT: " Codex " })).toBe("codex");
  });

  it("detects current Codex CLI from CODEX_CI=1", () => {
    expect(detectAgentRuntime({ CODEX_CI: "1" })).toBe("codex");
  });

  it("defaults to Claude-compatible output", () => {
    expect(detectAgentRuntime({})).toBe("claude");
  });
});
