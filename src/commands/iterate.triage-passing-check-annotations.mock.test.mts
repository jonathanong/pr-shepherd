import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate.triage-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("triage — passing-check annotations", () => {
  it("does not return triage for annotations whose parent check passed", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        checks: {
          passing: [
            {
              id: "CR_sonar",
              name: "SonarCloud Code Analysis",
              status: "COMPLETED",
              conclusion: "SUCCESS",
              detailsUrl: "https://sonarcloud.io",
              event: "pull_request",
              runId: null,
              category: "passed",
              annotations: [
                {
                  id: "check_annotation_lua",
                  path: "scripts/instrument-lua.cjs",
                  startLine: 30,
                  endLine: 30,
                  level: "WARNING",
                  title: 'Remove this assignment of "i".',
                  message: "See more on https://sonarcloud.io",
                },
              ],
            },
          ],
          failing: [],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("ready");
  });

  it("does not keep triage alive for already-seen passing-check annotations", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        checks: {
          passing: [
            {
              id: "CR_sonar",
              name: "SonarCloud Code Analysis",
              status: "COMPLETED",
              conclusion: "SUCCESS",
              detailsUrl: "https://sonarcloud.io",
              event: "pull_request",
              runId: null,
              category: "passed",
            },
          ],
          failing: [],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("ready");
  });

  it("does not treat skipped annotated checks as failing CI", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        checks: {
          passing: [],
          failing: [],
          inProgress: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
          skipped: [
            {
              id: "CR_skip",
              name: "skipped-ci",
              status: "COMPLETED",
              conclusion: "NEUTRAL",
              detailsUrl: "https://checks.example/skipped",
              event: "push",
              runId: "99",
              category: "skipped",
              annotations: [
                {
                  id: "check_annotation_skip",
                  path: "src/a.mts",
                  startLine: 1,
                  endLine: 1,
                  level: "FAILURE",
                  message: "Skipped check annotation.",
                },
              ],
            },
          ],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.checks).toHaveLength(1);
      expect(result.triage.checks[0]?.annotationOnly).toBe(true);
      expect(result.triage.checks[0]?.conclusion).toBe("NEUTRAL");
      expect(result.triage.instructions.join("\n")).not.toContain("## Failing checks");
      expect(result.triage.resolveCommand.requiresHeadSha).toBe(false);
    }
  });
});
