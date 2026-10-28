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
});
