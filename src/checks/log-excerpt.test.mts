import { describe, expect, it } from "vitest";
import { buildLogExcerpt } from "./log-excerpt.mts";

const TS = "2026-09-14T23:16:21.5724499Z";

function log(lines: string[]): string {
  return lines.map((line) => `${TS} ${line}`).join("\n");
}

describe("buildLogExcerpt — first failed step", () => {
  it("returns visible output of a uses: step and drops the run-command group and post-job cleanup", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "with:",
        "  repository: jonathanong/no-mistakes",
        "##[endgroup]",
        "Syncing repository: jonathanong/no-mistakes",
        "hint: call git config --global init.defaultBranch to suppress this error warning",
        "##[group]Run actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
        "with:",
        "  name: codspeed-analysis",
        "env:",
        "  CARGO_TERM_COLOR: always",
        "##[endgroup]",
        "Downloading single artifact",
        "Preparing to download the following artifacts:",
        "- codspeed-analysis (ID: 10373487188, Size: 711311516)",
        "Starting download of artifact to: /home/runner/work/no-mistakes/no-mistakes",
        "##[error]The action 'Download benchmark executables' has timed out after 5 minutes.",
        "Post job cleanup.",
        "[command]/usr/bin/git version",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toBe(
      [
        "Downloading single artifact",
        "Preparing to download the following artifacts:",
        "- codspeed-analysis (ID: 10373487188, Size: 711311516)",
        "Starting download of artifact to: /home/runner/work/no-mistakes/no-mistakes",
        "##[error]The action 'Download benchmark executables' has timed out after 5 minutes.",
      ].join("\n"),
    );
  });

  it("drops a run: script group and keeps only the step's echo plus the error", () => {
    const cyan = `${String.fromCharCode(27)}[36;1m`;
    const reset = `${String.fromCharCode(27)}[0m`;
    const excerpt = buildLogExcerpt(
      [
        `${TS} ##[group]Run if [[ "$CHANGE_RESULT" != "success" ]]; then`,
        `${TS} ${cyan}if [[ "$CHANGE_RESULT" != "success" ]]; then${reset}`,
        `${TS} ${cyan}  echo "Benchmark build or execution failed." >&2${reset}`,
        `${TS} shell: /usr/bin/bash -e {0}`,
        `${TS} env:`,
        `${TS}   SHARD_RESULT: failure`,
        `${TS} ##[endgroup]`,
        `${TS} Benchmark build or execution failed.`,
        `${TS} ##[error]Process completed with exit code 1.`,
        `${TS} Cleaning up orphan processes`,
      ].join("\n"),
    );

    expect(excerpt).toBe(
      "Benchmark build or execution failed.\n##[error]Process completed with exit code 1.",
    );
  });

  it("omits a later if: always() step after the first ##[error]", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "echo tests",
        "##[endgroup]",
        "test output",
        "##[error]Process completed with exit code 1.",
        "##[group]Run upload logs",
        "with:",
        "  name: logs",
        "##[endgroup]",
        "uploaded",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toBe("test output\n##[error]Process completed with exit code 1.");
    expect(excerpt).not.toContain("uploaded");
    expect(excerpt).not.toContain("Run upload logs");
  });

  it("keeps in-step lines after the error until the next step", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "##[endgroup]",
        "##[error]boom",
        "stack frame 1",
        "stack frame 2",
        "##[group]Run always",
        "##[endgroup]",
        "post step",
      ]),
    );

    expect(excerpt).toBe("##[error]boom\nstack frame 1\nstack frame 2");
  });
});

describe("buildLogExcerpt — fallback without step groups", () => {
  it("clips Cleaning up orphan processes and still includes in-range context", () => {
    const excerpt = buildLogExcerpt(`setup line
useful context before failure
One or more required jobs failed or were cancelled
cleanup after failure
Cleaning up orphan processes
Terminate orphan process: pid 1`);

    expect(excerpt).toContain("useful context before failure");
    expect(excerpt).toContain("One or more required jobs failed or were cancelled");
    expect(excerpt).toContain("cleanup after failure");
    expect(excerpt).not.toContain("Cleaning up orphan processes");
    expect(excerpt).not.toContain("Terminate orphan process");
  });

  it("suffix-truncates a huge isolated step while keeping the error line", () => {
    const excerpt = buildLogExcerpt(
      log([
        "##[group]Run tests",
        "##[endgroup]",
        `${"verbose passing tests ".repeat(400)}`,
        "##[error]Process completed with exit code 1.",
        "Cleaning up orphan processes",
      ]),
    );

    expect(excerpt).toContain("##[error]Process completed with exit code 1.");
    expect(excerpt).toContain("[truncated]");
    expect(excerpt).not.toContain("Cleaning up orphan processes");
    expect(excerpt!.startsWith("[truncated]\n")).toBe(true);
  });
});
