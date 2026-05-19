import { describe, it, expect } from "vitest";
import { registerHooks, getStdout, mockRunIterate } from "./cli-parser.iterate.test-support.mts";
import { formatIterateResult } from "./cli/iterate-formatter.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — iterate text format", () => {
  it("lean mode: summary shows non-zero skipped, filtered, and in-progress counts", async () => {
    const result = {
      ...makeIterateResult("wait"),
      summary: { passing: 2, skipped: 1, filtered: 1, inProgress: 3 },
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("2 passing, 1 skipped, 1 filtered, 3 inProgress");
  });
  it("lean mode: blockingBotReviewInProgress and isDraft shown only when true", async () => {
    const result = {
      ...makeIterateResult("wait"),
      blockingBotReviewInProgress: true,
      isDraft: true,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    expect(text).toContain("**blockingBotReviewInProgress**");
    expect(text).toContain("**isDraft**");
  });
  it("verbose mode: summary line includes all fields including shouldCancel and false booleans", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain("shouldCancel");
    expect(text).toContain(`**remainingSeconds** 60`);
    expect(text).toContain("blockingBotReviewInProgress");
    expect(text).toContain("isDraft");
    expect(text).toContain("0 skipped");
    expect(text).toContain("0 filtered");
  });
  it("formatIterateResult uses default options when called directly", () => {
    expect(formatIterateResult(makeIterateResult("wait"))).toContain("# PR #42 [WAIT]");
  });
  it("format parity (verbose): text output surfaces every scalar base field that JSON carries", async () => {
    const result = makeIterateResult("wait");
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain(`# PR #${result.pr}`);
    expect(text).toContain(`\`${result.status}\``);
    expect(text).toContain(`\`${result.mergeStateStatus}\``);
    expect(text).toContain(`\`${result.state}\``);
    expect(text).toContain(`${result.summary.passing} passing`);
    expect(text).toContain(`${result.summary.inProgress} inProgress`);
    expect(text).toContain(`**remainingSeconds** ${result.remainingSeconds}`);
  });
  it("json lean: omits shouldCancel, false booleans, and remainingSeconds when status != READY", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.shouldCancel).toBeUndefined();
    expect(parsed.blockingBotReviewInProgress).toBeUndefined();
    expect(parsed.isDraft).toBeUndefined();
    expect(parsed.remainingSeconds).toBeUndefined();
    // checks omitted for wait action
    expect(parsed.checks).toBeUndefined();
  });
  it("json lean: summary omits zero counts", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait")); // skipped/filtered = 0
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.summary.skipped).toBeUndefined();
    expect(parsed.summary.filtered).toBeUndefined();
    expect(parsed.summary.inProgress).toBe(1); // non-zero, must be present
  });
  it("json verbose: emits full result with all fields including shouldCancel and false booleans", async () => {
    const result = makeIterateResult("wait");
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--format", "json", "--verbose"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.shouldCancel).toBe(false);
    expect(parsed.blockingBotReviewInProgress).toBe(false);
    expect(parsed.isDraft).toBe(false);
    expect(parsed.remainingSeconds).toBe(60);
    expect(parsed.summary.skipped).toBe(0);
    expect(parsed.summary.filtered).toBe(0);
  });
  it("text: reviewDecision shown in heading when mergeStatus=BLOCKED from HAS_HOOKS raw", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: "REVIEW_REQUIRED" as const,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain("**reviewDecision** `REVIEW_REQUIRED`");
  });
  it("text: reviewDecision omitted from heading when mergeStatus=BLOCKED+HAS_HOOKS but null", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: null,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    expect(getStdout()).not.toContain("reviewDecision");
  });
  it("text lean: branch behind shown when mergeStatus=BEHIND", async () => {
    const result = { ...makeIterateResult("wait"), mergeStatus: "BEHIND" as const };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**branch** behind `origin/main`");
  });
  it("text verbose: branch behind shown when mergeStatus=BEHIND", async () => {
    const result = { ...makeIterateResult("wait"), mergeStatus: "BEHIND" as const };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    expect(getStdout()).toContain("**branch** behind `origin/main`");
  });
  it("text verbose: branch conflicts shown when mergeStatus=CONFLICTS", async () => {
    const result = { ...makeIterateResult("wait"), mergeStatus: "CONFLICTS" as const };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    expect(getStdout()).toContain("**branch** conflicts with `origin/main`");
  });
  it("json lean: reviewDecision included when mergeStatus=BLOCKED from HAS_HOOKS raw", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: "REVIEW_REQUIRED" as const,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.reviewDecision).toBe("REVIEW_REQUIRED");
  });
});
