import { describe, expect, it } from "vitest";
import { mcpVerificationNote, repinMcpApiMap } from "../evals/tokens/lib.mjs";

describe("repinMcpApiMap (evals/tokens/record.mjs)", () => {
  it("resets verified when the map is repinned to a different commit", () => {
    const map = { source: "github/github-mcp-server@aaa", verified: true };
    repinMcpApiMap(map, "github/github-mcp-server@bbb");
    expect(map).toEqual({ source: "github/github-mcp-server@bbb", verified: false });
  });

  it("keeps verified when the commit is unchanged", () => {
    const map = { source: "github/github-mcp-server@aaa", verified: true };
    repinMcpApiMap(map, "github/github-mcp-server@aaa");
    expect(map).toEqual({ source: "github/github-mcp-server@aaa", verified: true });
  });

  it("leaves an unverified map unverified", () => {
    const map = { source: "github/github-mcp-server@aaa", verified: false };
    repinMcpApiMap(map, "github/github-mcp-server@bbb");
    expect(map.verified).toBe(false);
  });
});

describe("mcpVerificationNote (evals/tokens/bench.mjs)", () => {
  it("says the map is unverified when verified is false", () => {
    expect(mcpVerificationNote({ source: "github/github-mcp-server@aaa", verified: false })).toBe(
      "The MCP mapping is unverified.",
    );
  });

  it("names the pinned source when verified is true", () => {
    expect(mcpVerificationNote({ source: "github/github-mcp-server@aaa", verified: true })).toBe(
      "The MCP mapping is verified against github/github-mcp-server@aaa.",
    );
  });
});
