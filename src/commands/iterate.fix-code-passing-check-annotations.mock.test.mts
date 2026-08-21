import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — passing-check annotations", () => {
  it("returns fix_code for unseen passing-check annotations and omits them from failing checks", async () => {
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

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.fix.checks[0]?.conclusion).toBe("SUCCESS");
      expect(result.fix.checks[0]?.annotations?.[0]?.id).toBe("check_annotation_lua");
      expect(result.fix.instructions.join("\n")).not.toContain("## Failing checks");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
    }
  });

  it("does not keep fix_code alive for already-seen passing-check annotations", async () => {
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

    expect(result.action).toBe("wait");
  });
});
