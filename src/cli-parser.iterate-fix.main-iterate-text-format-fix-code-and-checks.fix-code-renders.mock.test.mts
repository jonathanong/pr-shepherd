// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunIterate,
} from "./cli-parser.iterate-fix.test-support.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — iterate text format (fix_code and checks)", () => {
  it("fix_code: renders '## Review IDs to minimize queue' for seen summary IDs", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");

    result.fix.reviewSummaryIds = ["PRR_BOT", "PRR_AP"];
    result.fix.resolveCommand = {
      argv: ["pr-shepherd", "resolve", "42", "--minimize-comment-ids", "PRR_BOT,PRR_AP"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review IDs to minimize queue");
    expect(out).toContain("- `PRR_BOT`\n- `PRR_AP`");
    expect(out).toContain(
      "- resolve: `pr-shepherd resolve 42 --minimize-comment-ids PRR_BOT,PRR_AP`",
    );
    expect(out).not.toContain("## Approvals (surfaced");
  });
  it("fix_code: renders resolution-only threads with status tags", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");

    result.fix.resolutionOnlyThreads = [
      {
        id: "PRT_min",
        isResolved: false,
        isOutdated: false,
        isMinimized: true,
        path: "src/old.ts",
        line: 3,
        startLine: null,
        author: "reviewer",
        authorType: "User" as const,
        body: "already hidden",
        url: "https://example.com/thread",
        createdAtUnix: 0,
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review threads to resolve");
    expect(out).toContain("`threadId=PRT_min`");
    expect(out).toContain("[status: minimized]");
  });
  it("fix_code: renders '## Review summaries (first look)' with body when firstLookSummaries is non-empty", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");

    result.fix.firstLookSummaries = [
      {
        id: "PRR_FL",
        author: "copilot",
        authorType: "Unknown" as const,
        body: "Nice work overall.",
      },
    ];
    result.fix.reviewSummaryIds = ["PRR_FL"];
    result.fix.resolveCommand = {
      argv: ["pr-shepherd", "resolve", "42", "--minimize-comment-ids", "PRR_FL"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review summaries (first look)");
    expect(out).toContain("### `reviewId=PRR_FL` (@copilot · Unknown)");
    expect(out).toContain("> Nice work overall.");
    // ID is in the resolve command but NOT in the bare minimize-queue section.
    expect(out).toContain("--minimize-comment-ids PRR_FL");
    expect(out).not.toContain("## Review IDs to minimize queue");
  });
  it("fix_code: renders '## Approvals (surfaced — not minimized)' with H3 + blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");

    result.fix.surfacedApprovals = [
      {
        id: "PRR_HUMAN",
        author: "alice",
        authorType: "Unknown" as const,
        body: "Looks reasonable but please double-check X.",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Approvals (surfaced — not minimized)");
    expect(out).toContain("### `reviewId=PRR_HUMAN` (@alice · Unknown)");
    expect(out).toContain("> Looks reasonable but please double-check X.");
  });
  it("fix_code: approval with empty body renders '(no review body)' instead of bare blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");

    result.fix.surfacedApprovals = [
      { id: "PRR_EMPTY", author: "alice", authorType: "Unknown" as const, body: "" },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("### `reviewId=PRR_EMPTY` (@alice · Unknown)");
    expect(out).toContain("(no review body)");
    expect(out).not.toContain("\n>\n");
  });
});
