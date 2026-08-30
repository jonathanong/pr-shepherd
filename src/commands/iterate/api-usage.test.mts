import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeIterateResult } from "../../../fixtures/cli-parser.iterate-fixtures.mts";
import type { PrShepherdConfig } from "../../config/load.mts";
import type { ApiUsage, GraphqlQuotaWarning, IterateResult } from "../../types.mts";

const { mockLoadConfig, mockSummarizeApiTelemetry, mockEvaluateQuotaWarning } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockSummarizeApiTelemetry: vi.fn(),
  mockEvaluateQuotaWarning: vi.fn(),
}));

vi.mock("../../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../../github/api-telemetry.mts", () => ({
  summarizeApiTelemetry: mockSummarizeApiTelemetry,
}));
vi.mock("../../state/graphql-quota-warnings.mts", () => ({
  evaluateWorktreeGraphqlQuotaWarning: mockEvaluateQuotaWarning,
}));

import { attachApiUsage } from "./api-usage.mts";

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

const graphqlUsage = {
  resource: "graphql",
  requestCount: 3,
  limit: 5000,
  used: 4100,
  remaining: 900,
  resetAt: 1_788_066_749,
  measuredQueryCost: 4,
  unmeasuredRequestCount: 1,
  nodeCount: 20,
};

const apiUsage: ApiUsage = {
  credentialSources: ["GH_TOKEN"],
  graphql: graphqlUsage,
};

const warning: GraphqlQuotaWarning = {
  resource: "graphql",
  thresholdPercent: 20,
  remaining: 900,
  limit: 5000,
  used: 4100,
  resetAt: 1_788_066_749,
  pollIntervalMinutes: 5,
  pollTimeoutMinutes: 10,
};

type FixCodeResult = Extract<IterateResult, { action: "fix_code" }>;

function fixCodeResult(instructions?: string[]): FixCodeResult {
  const result = makeIterateResult("fix_code") as FixCodeResult;
  return {
    ...result,
    fix: {
      ...result.fix,
      ...(instructions !== undefined && { instructions }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({ watch: { graphqlQuotaWarnings: bands } } as PrShepherdConfig);
  mockSummarizeApiTelemetry.mockReturnValue(apiUsage);
  mockEvaluateQuotaWarning.mockResolvedValue(undefined);
});

describe("attachApiUsage", () => {
  it("returns the original result when this command recorded no API telemetry", async () => {
    const result = makeIterateResult("wait");
    mockSummarizeApiTelemetry.mockReturnValue(undefined);

    await expect(attachApiUsage(result, 17, true)).resolves.toBe(result);
    expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
  });

  it.each([
    ["wait", makeIterateResult("wait"), true],
    ["mark_ready", makeIterateResult("mark_ready"), true],
    ["merge", makeIterateResult("merge"), true],
    ["ordinary fix_code", fixCodeResult(), true],
    ["stop-polling fix_code", fixCodeResult(["Stop polling until CI is fixed."]), false],
    [
      "human-direction fix_code",
      fixCodeResult(["Wait for human direction before retrying."]),
      false,
    ],
    ["cancel", makeIterateResult("cancel"), false],
    ["escalate", makeIterateResult("escalate"), false],
  ] as const)(
    "evaluates GraphQL quota warnings for %s only when polling may continue",
    async (_, result, shouldEvaluate) => {
      await attachApiUsage(result, 17, false);

      if (shouldEvaluate) {
        expect(mockEvaluateQuotaWarning).toHaveBeenCalledOnce();
      } else {
        expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
      }
    },
  );

  it("attaches command-scoped telemetry and evaluates GraphQL quota with the repo, bands, and persistence choice", async () => {
    const result = makeIterateResult("wait");

    const attached = await attachApiUsage(result, 17, true);

    expect(attached).toEqual({ ...result, apiUsage });
    expect(mockSummarizeApiTelemetry).toHaveBeenCalledWith(17);
    expect(mockEvaluateQuotaWarning).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo" },
      bands,
      graphqlUsage,
      true,
    );
  });

  it("attaches the quota warning and replaces a fix-code continuation with its longer poll cadence", async () => {
    mockEvaluateQuotaWarning.mockResolvedValue(warning);
    const result = fixCodeResult();

    const attached = await attachApiUsage(result, 17, true);

    expect(attached).toMatchObject({ apiUsage, quotaWarning: warning, action: "fix_code" });
    if (attached.action !== "fix_code") throw new Error("expected fix_code result");
    expect(attached.fix.instructions.at(-1)).toContain("no more often than every 5 minutes");
    expect(attached.fix.instructions.at(-1)).toContain("--interval 5m --timeout 10m");
  });

  it("attaches non-GraphQL telemetry without evaluating or adding a quota warning", async () => {
    const restOnlyUsage: ApiUsage = {
      credentialSources: ["gh auth token"],
      rest: [
        {
          resource: "core",
          requestCount: 1,
          limit: 5000,
          remaining: 4999,
          resetAt: 1_788_066_749,
        },
      ],
    };
    mockSummarizeApiTelemetry.mockReturnValue(restOnlyUsage);
    const result = makeIterateResult("wait");

    await expect(attachApiUsage(result, 17, true)).resolves.toEqual({
      ...result,
      apiUsage: restOnlyUsage,
    });
    expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
  });

  it("keeps fix-code instructions unchanged when quota evaluation produces no warning", async () => {
    const result = fixCodeResult();

    const attached = await attachApiUsage(result, 17, true);

    expect(attached).toEqual({ ...result, apiUsage });
    if (attached.action !== "fix_code") throw new Error("expected fix_code result");
    expect(attached.fix.instructions).toEqual(result.fix.instructions);
  });
});
