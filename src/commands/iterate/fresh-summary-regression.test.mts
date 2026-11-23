import { describe, expect, it } from "vitest";
import type { RawSummaryPr } from "../../github/poll-summary-raw.mts";
import { freshSummaryRegression } from "./fresh-summary-regression.mts";

const raw = (mergeStateStatus: string) => ({ mergeStateStatus }) as RawSummaryPr;

describe("freshSummaryRegression", () => {
  it("is undefined when nothing contradicts the report", () => {
    expect(freshSummaryRegression(raw("CLEAN"), { passing: 2 }, "CLEAN")).toBeUndefined();
    // UNSTABLE that the report already saw (ignored checks) is not a change.
    expect(freshSummaryRegression(raw("UNSTABLE"), {}, "UNSTABLE")).toBeUndefined();
    // A change to BLOCKED is left to the receipt path.
    expect(freshSummaryRegression(raw("BLOCKED"), {}, "CLEAN")).toBeUndefined();
  });

  it("names each kind of contradicting evidence", () => {
    expect(freshSummaryRegression(raw("CLEAN"), { inProgress: 1 }, "CLEAN")).toMatch(/queued/);
    expect(freshSummaryRegression(raw("CLEAN"), { failing: 1 }, "CLEAN")).toMatch(/failing/);
    expect(freshSummaryRegression(raw("CLEAN"), { unreportedRequired: ["ci"] }, "CLEAN")).toMatch(
      /required check/,
    );
    expect(
      freshSummaryRegression(raw("CLEAN"), { actionsWorkflowInProgress: true }, "CLEAN"),
    ).toMatch(/Actions workflow/);
    expect(freshSummaryRegression(raw("DIRTY"), {}, "CLEAN")).toMatch(/changed to DIRTY/);
  });

  it("ignores a running Actions suite once a relevant check exists", () => {
    expect(
      freshSummaryRegression(
        raw("CLEAN"),
        { actionsWorkflowInProgress: true, passing: 1 },
        "CLEAN",
      ),
    ).toBeUndefined();
  });
});
