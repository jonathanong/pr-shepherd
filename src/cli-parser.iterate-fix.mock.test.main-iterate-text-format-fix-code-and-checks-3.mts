// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStdout,
  main,
  makeIterateResult,
  mockRunIterate,
} from "./cli-parser.iterate-fix.test-support.mts";

registerHooks();

describe("main — iterate text format (fix_code and checks)", () => {
  it("fix_code: multi-paragraph thread body is preserved verbatim in the blockquote", async () => {
    const multiParagraphBody = [
      "First paragraph giving context.",
      "",
      "Second paragraph with a specific suggestion about line 42.",
      "",
      "Third paragraph with a ```suggestion``` block that must survive.",
    ].join("\n");
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-multi",
        path: "src/x.ts",
        line: 1,
        author: "reviewer",
        authorType: "Unknown" as const,
        body: multiParagraphBody,
        url: "",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.split("\n");
    const headerIdx = lines.findIndex(
      (l) => l === "### `threadId=t-multi` — `src/x.ts:1` (@reviewer · Unknown)",
    );
    expect(headerIdx).toBeGreaterThan(-1);
    // Blockquote follows after a blank line; empty paragraphs are rendered as bare `>`.
    expect(lines[headerIdx + 2]).toBe("> First paragraph giving context.");
    expect(lines[headerIdx + 3]).toBe(">");
    expect(lines[headerIdx + 4]).toBe(
      "> Second paragraph with a specific suggestion about line 42.",
    );
    expect(lines[headerIdx + 5]).toBe(">");
    expect(lines[headerIdx + 6]).toBe(
      "> Third paragraph with a ```suggestion``` block that must survive.",
    );
  });
  it("fix_code: multi-line thread heading shows startLine-endLine range", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-range",
        path: "src/foo.ts",
        line: 42,
        startLine: 40,
        author: "alice",
        authorType: "Unknown" as const,
        body: "Collapse these.",
        url: "",
        suggestion: { startLine: 40, endLine: 42, lines: ["const x = 1;"], author: "alice" },
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("### `threadId=t-range` — `src/foo.ts:40-42` (@alice · Unknown)");
    expect(out).toContain("[suggestion]");
    expect(out).toContain("Replaces lines 40–42:");
    expect(out).toContain("const x = 1;");
  });
  it("fix_code: single-line thread heading shows only end line (no range)", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-single",
        path: "src/foo.ts",
        line: 10,
        author: "alice",
        authorType: "Unknown" as const,
        body: "Fix this.",
        url: "",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("### `threadId=t-single` — `src/foo.ts:10` (@alice · Unknown)");
    expect(out).not.toContain("10-10");
  });
  it("fix_code: CRLF line endings in thread body are normalized in blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-crlf",
        path: "src/x.ts",
        line: 1,
        author: "reviewer",
        authorType: "Unknown" as const,
        body: "First line.\r\nSecond line.",
        url: "",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("> First line.\n> Second line.");
    expect(out).not.toContain("\r");
  });
  it("fix_code: check with runId=null + detailsUrl renders 'external `<url>`', without detailsUrl falls back to '(no runId)'", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") {
      throw new Error("unreachable");
    }
    result.fix.checks = [
      {
        name: "codecov/patch",
        runId: null,
        detailsUrl: "https://app.codecov.io/a/b",
        conclusion: "FAILURE" as const,
      },
      {
        name: "mystery-check",
        runId: null,
        detailsUrl: null,
        conclusion: "FAILURE" as const,
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("- external `https://app.codecov.io/a/b` — `codecov/patch`");
    expect(out).toContain("- (no runId) — `mystery-check`");
  });
});
