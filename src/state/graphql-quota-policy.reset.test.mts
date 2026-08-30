import { describe, expect, it } from "vitest";
import type { GraphqlApiUsage } from "../types.mts";
import {
  evaluateGraphqlQuotaWarning,
  type GraphqlQuotaWarningState,
} from "./graphql-quota-policy.mts";

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

function sample(remaining: number, used = 5000 - remaining): GraphqlApiUsage {
  return {
    resource: "graphql",
    requestCount: 1,
    limit: 5000,
    used,
    remaining,
    resetAt: 1_700_000_000,
    measuredQueryCost: 1,
    unmeasuredRequestCount: 0,
    nodeCount: 1,
  };
}

describe("evaluateGraphqlQuotaWarning reset detection", () => {
  it("re-arms when GitHub usage drops for a new quota window", () => {
    const prior: GraphqlQuotaWarningState = {
      resource: "graphql",
      limit: 5000,
      lastUsed: 4500,
      lastRemaining: 500,
      resetAt: 1_700_000_000,
      warnedThresholds: [30, 20, 10],
    };
    const freshWindow = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1400, 3600), resetAt: 1_700_003_600 },
      prior,
    );

    expect(freshWindow.warning?.thresholdPercent).toBe(30);
    expect(freshWindow.state.warnedThresholds).toEqual([30]);
  });

  it("re-arms on a remaining increase when the prior sample omitted used", () => {
    const prior: GraphqlQuotaWarningState = {
      resource: "graphql",
      limit: 5000,
      lastRemaining: 500,
      resetAt: 1_700_000_000,
      warnedThresholds: [30, 20, 10],
    };
    const freshWindow = evaluateGraphqlQuotaWarning(bands, sample(1400, 3600), prior);

    expect(freshWindow.warning?.thresholdPercent).toBe(30);
    expect(freshWindow.state.warnedThresholds).toEqual([30]);
  });

  it("does not re-arm for a resetAt-only adjustment", () => {
    const prior: GraphqlQuotaWarningState = {
      resource: "graphql",
      limit: 5000,
      lastUsed: 3600,
      lastRemaining: 1400,
      resetAt: 1_700_000_000,
      warnedThresholds: [30],
    };
    const movedReset = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1300, 3700), resetAt: 1_700_000_600 },
      prior,
      1_699_999_900,
    );

    expect(movedReset.warning).toBeUndefined();
    expect(movedReset.state.warnedThresholds).toEqual([30]);
  });

  it("re-arms after the prior reset deadline even when shared usage increases", () => {
    const prior: GraphqlQuotaWarningState = {
      resource: "graphql",
      limit: 5000,
      lastUsed: 3600,
      lastRemaining: 1400,
      resetAt: 1_700_000_000,
      warnedThresholds: [30],
    };
    const nextWindow = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1300, 3700), resetAt: 1_700_003_600 },
      prior,
      1_700_000_001,
    );

    expect(nextWindow.warning?.thresholdPercent).toBe(30);
    expect(nextWindow.state.warnedThresholds).toEqual([30]);
  });
});
