import { describe, expect, it } from "vitest";
import {
  evaluateGraphqlQuotaWarning,
  type GraphqlQuotaWarningState,
} from "./graphql-quota-policy.mts";

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

function sample(remaining: number, used = 5000 - remaining) {
  return {
    resource: "graphql",
    limit: 5000,
    used,
    remaining,
    resetAt: 1_700_000_000,
  };
}

describe("evaluateGraphqlQuotaWarning", () => {
  it("emits the current band and marks skipped higher bands as crossed", () => {
    const result = evaluateGraphqlQuotaWarning(bands, sample(1250), null);
    expect(result.warning).toMatchObject({
      thresholdPercent: 30,
      pollIntervalMinutes: 2,
      pollTimeoutMinutes: 4,
      remaining: 1250,
      limit: 5000,
    });
    expect(result.state.warnedThresholds).toEqual([30]);
  });

  it("emits only the lowest applicable band on a first observation", () => {
    const result = evaluateGraphqlQuotaWarning(bands, sample(250), null);
    expect(result.warning?.thresholdPercent).toBe(10);
    expect(result.warning?.pollIntervalMinutes).toBe(10);
    expect(result.state.warnedThresholds).toEqual([30, 20, 10]);
  });

  it("warns once per band and advances at the next crossing", () => {
    const first = evaluateGraphqlQuotaWarning(bands, sample(1400), null);
    const repeat = evaluateGraphqlQuotaWarning(bands, sample(1300), first.state);
    const next = evaluateGraphqlQuotaWarning(bands, sample(900), repeat.state);

    expect(first.warning?.thresholdPercent).toBe(30);
    expect(repeat.warning).toBeUndefined();
    expect(next.warning?.thresholdPercent).toBe(20);
  });

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
