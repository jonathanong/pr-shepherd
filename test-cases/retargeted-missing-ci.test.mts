import { describe, expect, it } from "vitest";
import {
  applyFixture,
  captureRun,
  loadFixture,
  registerHarnessBefore,
} from "../test-helpers/test-cases/harness.mts";

registerHarnessBefore();

describe("PR #2099 after retargeting to main", () => {
  it("retriggers missing CI once without rewriting its current head", async () => {
    const fixture = loadFixture("128-fix-code-retargeted-missing-ci");
    applyFixture(fixture);
    const run = await captureRun(fixture);
    const output = JSON.parse(run.jsonOut) as {
      action: string;

      unreportedRequiredChecks: string[];
      fix: { instructions: string[] };
    };
    expect(output.action).toBe("fix_code");

    expect(output.unreportedRequiredChecks).toEqual([
      "static",
      "backend",
      "web",
      "cloudflare-worker",
      "lambdas",
      "tooling",
      "gitleaks",
    ]);
    const steps = output.fix.instructions.join("\n");
    expect(steps.match(/gh pr close 2099 -R vouchington\/vouchington/g)).toHaveLength(1);
    expect(steps.match(/gh pr reopen 2099 -R vouchington\/vouchington/g)).toHaveLength(1);
    expect(steps).toContain("This branch is not behind `main`");
    expect(steps).toContain("Do not close the PR again");
    expect(steps).not.toMatch(/\brebase\b|\bpush\b|gh stack/);
    expect(run.textOut).toContain("gh pr close 2099 -R vouchington/vouchington");
    expect(run.textOut).toContain("gh pr reopen 2099 -R vouchington/vouchington");
  });
});
