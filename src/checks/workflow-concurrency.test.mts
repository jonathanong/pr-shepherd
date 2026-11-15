import { describe, expect, it } from "vitest";
import { parseWorkflowConcurrency } from "./workflow-concurrency.mts";

describe("parseWorkflowConcurrency", () => {
  it("accepts only the literal true as a cancel", () => {
    expect(
      parseWorkflowConcurrency("concurrency:\n  group: g\n  cancel-in-progress: true\n"),
    ).toEqual({ raw: "cancel-in-progress=true", cancelInProgress: true });
  });

  it("surfaces a false value raw without a cancel", () => {
    expect(parseWorkflowConcurrency("concurrency:\n  cancel-in-progress: false\n")).toEqual({
      raw: "cancel-in-progress=false",
      cancelInProgress: false,
    });
  });

  it("surfaces an expression raw and never treats it as true", () => {
    expect(
      parseWorkflowConcurrency(
        "concurrency:\n  group: g\n  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n",
      ),
    ).toEqual({
      raw: "cancel-in-progress=${{ github.ref != 'refs/heads/main' }}",
      cancelInProgress: false,
    });
  });

  it("does not treat the string 'true' or a non-scalar as true", () => {
    expect(parseWorkflowConcurrency("concurrency:\n  cancel-in-progress: 'true'\n")).toEqual({
      raw: "cancel-in-progress=true",
      cancelInProgress: false,
    });
    expect(parseWorkflowConcurrency("concurrency:\n  cancel-in-progress: [1]\n")).toEqual({
      raw: "cancel-in-progress=[1]",
      cancelInProgress: false,
    });
  });

  it("withholds a cancel unless the group is verified stable across pushes", () => {
    const withGroup = (group: string) =>
      parseWorkflowConcurrency(`concurrency:\n  group: "${group}"\n  cancel-in-progress: true\n`);
    for (const group of [
      "ci-${{ github.sha }}",
      "ci-${{ github.run_id }}",
      "ci-${{ github.event.pull_request.head.sha }}",
      "ci-${{ github['sha'] }}",
      "ci-${{ github.event.after }}",
      "ci-${{ matrix.os }}",
    ]) {
      expect(withGroup(group)).toEqual({
        raw: "cancel-in-progress=true (group not verified stable)",
        cancelInProgress: false,
      });
    }
    for (const group of [
      "ci",
      "ci-${{ github.ref }}",
      "ci-${{ 'literal' }}",
      "${{ github.workflow }}-${{ github.head_ref }}",
      "${{ format('{0}-{1}', github.workflow, github.event.pull_request.number) }}",
    ]) {
      expect(withGroup(group)?.cancelInProgress).toBe(true);
    }
    expect(
      parseWorkflowConcurrency("concurrency:\n  cancel-in-progress: true\n")?.cancelInProgress,
    ).toBe(false);
  });

  it("withholds a cancel when a push to the PR does not retrigger the workflow", () => {
    const body = "concurrency:\n  group: g\n  cancel-in-progress: true\n";
    const raw = "cancel-in-progress=true (a push may not retrigger it)";
    const types = (on: string) => parseWorkflowConcurrency(`on:\n${on}\n${body}`);
    expect(types("  pull_request:\n    types: [opened, reopened]")?.raw).toBe(raw);
    expect(types("  pull_request:\n    types: [opened, synchronize]")?.cancelInProgress).toBe(true);
    expect(
      types(
        "  pull_request:\n    types: [labeled]\n  pull_request_target:\n    types: [synchronize]",
      )?.raw,
    ).toBe(raw);
    expect(types("  pull_request:\n    branches: [main]")?.cancelInProgress).toBe(true);
    expect(types("  pull_request:\n    paths: ['src/**']")?.raw).toBe(raw);
    expect(types("  pull_request:\n    paths-ignore: ['docs/**']")?.raw).toBe(raw);
    expect(types("  pull_request:")?.cancelInProgress).toBe(true);
    expect(types("  push:")?.cancelInProgress).toBe(true);
    expect(parseWorkflowConcurrency(`on: pull_request\n${body}`)?.cancelInProgress).toBe(true);
  });

  it("reports unset when concurrency has no cancel-in-progress or is a bare group string", () => {
    expect(parseWorkflowConcurrency("concurrency:\n  group: g\n")?.raw).toBe(
      "cancel-in-progress=unset",
    );
    expect(parseWorkflowConcurrency("concurrency: my-group\n")?.raw).toBe(
      "cancel-in-progress=unset",
    );
    expect(parseWorkflowConcurrency("concurrency: [a]\n")?.raw).toBe("cancel-in-progress=unset");
  });

  it("reports none for a workflow without top-level concurrency, even with a job-level one", () => {
    expect(parseWorkflowConcurrency("on: push\n")).toEqual({
      raw: "none",
      cancelInProgress: false,
    });
    expect(parseWorkflowConcurrency("concurrency:\njobs: {}\n")?.raw).toBe("none");
    expect(
      parseWorkflowConcurrency("jobs:\n  a:\n    concurrency:\n      cancel-in-progress: true\n")
        ?.raw,
    ).toBe("none");
  });

  it("returns undefined for YAML that does not parse or is not a mapping", () => {
    expect(parseWorkflowConcurrency("a: [unclosed")).toBeUndefined();
    expect(parseWorkflowConcurrency("")).toBeUndefined();
    expect(parseWorkflowConcurrency("- a\n- b\n")).toBeUndefined();
    expect(parseWorkflowConcurrency("just text")).toBeUndefined();
  });
});
