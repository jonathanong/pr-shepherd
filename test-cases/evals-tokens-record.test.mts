import { describe, expect, it } from "vitest";
import { repinMcpApiMap } from "../evals/tokens/lib.mjs";

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
