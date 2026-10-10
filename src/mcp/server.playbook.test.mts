import { describe, expect, it, vi } from "vitest";

import { createPrShepherdMcpServer } from "./server.mts";

interface RegisteredTool {
  annotations: Record<string, boolean>;
  inputSchema: { safeParse: (input: unknown) => { success: boolean } };
  handler: (input: unknown) => Promise<{
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text: string }>;
  }>;
}

function toolsOf(iterate = vi.fn()) {
  const server = createPrShepherdMcpServer({
    shepherd: {
      iterate,
      apply: vi.fn(),
      buildSuggestionPatches: vi.fn(),
      buildSuggestionPatch: vi.fn(),
      getJournal: vi.fn(),
    },
  });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

describe("MCP playbook tool", () => {
  it("lists playbooks with matching structured and Markdown content", async () => {
    const tool = toolsOf().playbook!;
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    const response = await tool.handler({});
    const names = (response.structuredContent as { playbooks: string[] }).playbooks;
    expect(names).toContain("Fix-code loop");
    expect(response.content?.[0]?.text).toContain("- Fix-code loop");
  });

  it("returns one playbook and reports unknown names as errors", async () => {
    const tool = toolsOf().playbook!;
    const response = await tool.handler({ name: "Fix-code loop" });
    expect(response.structuredContent).toMatchObject({ name: "Fix-code loop" });
    expect(response.content?.[0]?.text).toContain("# Fix-code loop");
    const missing = await tool.handler({ name: "nope" });
    expect(missing.isError).toBe(true);
  });
});

describe("MCP iterate instructions input", () => {
  it("accepts only playbook or inline and forwards the style", async () => {
    const iterate = vi.fn().mockResolvedValue({
      action: "wait",
      pr: 3,
      repo: "o/r",
      transport: "graphql",
      log: "waiting",
    });
    const tool = toolsOf(iterate).iterate!;
    expect(tool.inputSchema.safeParse({ pr: "o/r#3", instructions: "playbook" }).success).toBe(
      true,
    );
    expect(tool.inputSchema.safeParse({ pr: "o/r#3", instructions: "verbose" }).success).toBe(
      false,
    );
    await tool.handler({ pr: "o/r#3", instructions: "inline" });
    expect(iterate).toHaveBeenCalledWith({
      pr: "o/r#3",
      instructions: "inline",
    });
  });
});
