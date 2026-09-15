import { describe, expect, it } from "vitest";
import { buildLogExcerpt } from "./log-excerpt.mts";

const TS = "2026-09-14T23:16:21.5724499Z";

function log(lines: string[]): string {
  return lines.map((line) => `${TS} ${line}`).join("\n");
}

describe("buildLogExcerpt — step boundaries", () => {
  it("treats nested non-step groups as part of the failed step, not a new step", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "##[endgroup]",
        "##[group]Getting Git version info",
        "git version 2.55.0",
        "##[endgroup]",
        "##[error]boom",
        "##[group]Run always",
        "##[endgroup]",
        "uploaded",
      ]),
    );

    expect(excerpt).toBe("Getting Git version info\ngit version 2.55.0\n##[error]boom");
  });

  it("clips a following ##[group]Post step even without Post job cleanup.", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "##[endgroup]",
        "##[error]boom",
        "##[group]Post Checkout",
        "[command]/usr/bin/git version",
        "##[endgroup]",
      ]),
    );

    expect(excerpt).toBe("##[error]boom");
  });

  it("still isolates a step when the run-command group has no matching endgroup", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "echo tests",
        "visible output",
        "##[error]boom",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toBe("echo tests\nvisible output\n##[error]boom");
  });

  it("uses the last Run group when the log has no error or failure line", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run setup",
        "##[endgroup]",
        "setup done",
        "##[group]Run tests",
        "##[endgroup]",
        "all tests passed somehow",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toBe("all tests passed somehow");
  });
});

describe("buildLogExcerpt — fallback and aggregate", () => {
  it("returns undefined for an empty or whitespace-only log", () => {
    expect(buildLogExcerpt("")).toBeUndefined();
    expect(buildLogExcerpt("   \n\t  \n")).toBeUndefined();
  });

  it("falls back to the log tail when there are no groups and no failure markers", () => {
    expect(buildLogExcerpt("hello\nworld")).toBe("hello\nworld");
  });

  it("still condenses Job results when they sit in a grouped failed step", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run All checks passed",
        "echo check",
        "##[endgroup]",
        `Job results: {
  "detect-changes": { "result": "success", "outputs": {} },
  "test-playwright": { "result": "failure", "outputs": {} }
}`,
        "One or more required jobs failed or were cancelled",
        "##[error]Process completed with exit code 1.",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toBe(
      [
        "One or more required jobs failed or were cancelled",
        "##[error]Process completed with exit code 1.",
        "Job results (non-success):",
        "test-playwright: failure",
      ].join("\n"),
    );
  });
});
