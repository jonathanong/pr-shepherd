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
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
  withRestCoreCredentialFingerprint: <T,>(sample: T) => sample,
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
const QUOTA_RESUME_TEXT =
  "Resume full-cadence pr-shepherd after the GraphQL quota resets at 2026-08-30T05:12:29.000Z";

type TriageResult = Extract<IterateResult, { action: "triage" }>;

function triageResult(instructions?: string[]): TriageResult {
  const result = makeIterateResult("triage") as TriageResult;
  return {
    ...result,
    triage: {
      ...result.triage,
      ...(instructions !== undefined && { instructions }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({ quotaWarningBands: bands } as PrShepherdConfig);
  mockSummarizeApiTelemetry.mockReturnValue(apiUsage);
  mockEvaluateQuotaWarning.mockResolvedValue(undefined);
});

describe("attachApiUsage", () => {
  it("returns the original result when this command recorded no API telemetry", async () => {
    const result = makeIterateResult("wait");
    mockSummarizeApiTelemetry.mockReturnValue(undefined);
    await expect(attachApiUsage(result, true)).resolves.toBe(result);
    expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
  });

  it.each([
    ["wait", makeIterateResult("wait"), true],
    ["mark_ready", makeIterateResult("mark_ready"), true],
    ["merge", makeIterateResult("merge"), true],
    ["ordinary triage", triageResult(), true],
    ["triage wording does not alter recurrence", triageResult(["arbitrary text"]), true],
    ["cancel", makeIterateResult("cancel"), false],
    ["escalate", makeIterateResult("escalate"), false],
  ] as const)(
    "evaluates GraphQL quota warnings for %s only when polling may continue",
    async (_, result, shouldEvaluate) => {
      await attachApiUsage(result, false);
      if (shouldEvaluate) {
        expect(mockEvaluateQuotaWarning).toHaveBeenCalledOnce();
      } else {
        expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
      }
    },
  );

  it("attaches command-scoped telemetry and evaluates GraphQL quota with the repo, bands, and persistence choice", async () => {
    const result = makeIterateResult("wait");
    const attached = await attachApiUsage(result, true);
    expect(attached).toEqual({ ...result, apiUsage });
    expect(mockSummarizeApiTelemetry).toHaveBeenCalledWith();
    expect(mockEvaluateQuotaWarning).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo" },
      bands,
      graphqlUsage,
      true,
    );
  });

  it("does not recommend polling faster than the active polling command", async () => {
    const result = makeIterateResult("wait");
    await attachApiUsage(result, true, false, 15);

    expect(mockEvaluateQuotaWarning).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo" },
      bands.map((band) => ({ ...band, pollIntervalMinutes: 15 })),
      graphqlUsage,
      true,
    );
  });

  it("attaches the quota warning and replaces a triage continuation with its longer poll cadence", async () => {
    mockEvaluateQuotaWarning.mockResolvedValue(warning);
    const result = triageResult();
    const attached = await attachApiUsage(result, true);
    expect(attached).toMatchObject({ apiUsage, quotaWarning: warning, action: "triage" });
    if (attached.action !== "triage") throw new Error("expected triage result");
    expect(attached.triage.instructions.at(-1)).toContain(QUOTA_RESUME_TEXT);
    expect(attached.triage.instructions.at(-1)).toContain("no more often than every 5 minutes");
    expect(attached.triage.instructions.at(-1)).toContain("--interval 5m --timeout 10m");
  });

  it("evaluates REST core telemetry and adds no warning while it is above every band", async () => {
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
    await expect(attachApiUsage(result, true)).resolves.toEqual({
      ...result,
      apiUsage: restOnlyUsage,
    });
    expect(mockEvaluateQuotaWarning).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo" },
      bands,
      restOnlyUsage.rest?.[0],
      true,
    );
  });

  it("keeps triage instructions unchanged when quota evaluation produces no warning", async () => {
    const result = triageResult();
    const attached = await attachApiUsage(result, true);
    expect(attached).toEqual({ ...result, apiUsage });
    if (attached.action !== "triage") throw new Error("expected triage result");
    expect(attached.triage.instructions).toEqual(result.triage.instructions);
  });

  it("removes a deferred inner warning when the serialized outer evaluation suppresses it", async () => {
    const result = { ...makeIterateResult("wait"), quotaWarning: warning };
    await expect(attachApiUsage(result, true)).resolves.toEqual({
      ...makeIterateResult("wait"),
      apiUsage,
    });
  });

  it("preserves a warning that an until-terminal inner tick already persisted", async () => {
    const result = { ...makeIterateResult("wait"), quotaWarning: warning };
    await expect(attachApiUsage(result, true, true)).resolves.toEqual({
      ...result,
      apiUsage,
    });
    expect(mockEvaluateQuotaWarning).not.toHaveBeenCalled();
  });
});
