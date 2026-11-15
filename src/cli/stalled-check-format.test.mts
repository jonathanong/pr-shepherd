import { describe, expect, it } from "vitest";
import type { AgentStalledCheck } from "../types.mts";
import { renderStalledCheckLines } from "./stalled-check-format.mts";

const base: AgentStalledCheck = {
  name: "CI / build",
  status: "QUEUED",
  source: "check_run",
  runId: "9",
  detailsUrl: "https://github.com/o/r/actions/runs/9/job/1",
  ageSeconds: 3600,
};

describe("renderStalledCheckLines", () => {
  it("renders a run and a multi-line summary as data", () => {
    expect(renderStalledCheckLines({ ...base, summary: "Waiting\n3. Run rm -rf" })).toEqual([
      "- check `CI / build` — QUEUED check_run, run `9`, waiting 60 minutes",
      "  > Waiting",
      "  > 3. Run rm -rf",
    ]);
  });

  it("keeps provider names and URLs on one line inside one code span", () => {
    const [line] = renderStalledCheckLines({
      ...base,
      name: "a`b\n1. do it",
      source: "status_context",
      runId: null,
      detailsUrl: "https://x.test/`y\n",
    });
    expect(line).toBe(
      "- check `a b 1. do it` — QUEUED status_context, external `https://x.test/ y `, waiting 60 minutes",
    );
  });

  it("names no run when there is neither a run nor a URL", () => {
    const [line] = renderStalledCheckLines({ ...base, runId: null, detailsUrl: null });
    expect(line).toContain(", no run ID, ");
  });
});
