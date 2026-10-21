import { expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { formatIterateResult } from "./iterate-formatter.mts";

it("tells a looping READY result to rerun when the ready-delay elapses", () => {
  const result = makeIterateResult("ready");
  expect(result.action === "ready" && result.nextCheck).toBeFalsy();
  expect(formatIterateResult(result)).toContain(
    "Rerun this command when the timer elapses. Do not invent unrelated work.",
  );
});
