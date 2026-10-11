import { describe, expect, it } from "vitest";
import type { GraphqlApiUsage } from "../types.mts";
import { evaluateGraphqlQuotaWarning } from "./graphql-quota-policy.mts";

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

const fingerprintA = "a".repeat(16);
const fingerprintB = "b".repeat(16);

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
    credentialFingerprint: fingerprintA,
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

  it("does not re-arm or warn for an older sample in the same window", () => {
    const newer = evaluateGraphqlQuotaWarning(bands, sample(1200, 3800), null);
    const older = evaluateGraphqlQuotaWarning(bands, sample(1210, 3790), newer.state);

    expect(newer.warning?.thresholdPercent).toBe(30);
    expect(older.warning).toBeUndefined();
    expect(older.state.rearmEpoch).toBe(newer.state.rearmEpoch);
    expect(older.state.lastUsed).toBe(3800);
    expect(older.state.lastRemaining).toBe(1200);
    expect(older.state.credentialFingerprint).toBe(fingerprintA);
  });

  it("warns from the lowest remaining when a same-window sample reports a lower used", () => {
    // Proxy routes can disagree on X-RateLimit-Used within one window.
    const first = evaluateGraphqlQuotaWarning(bands, sample(1200, 3800), null);
    const next = evaluateGraphqlQuotaWarning(bands, sample(950, 3700), first.state);

    expect(next.warning).toMatchObject({ thresholdPercent: 20, remaining: 950, used: 3800 });
    expect(next.state).toMatchObject({ lastRemaining: 950, lastUsed: 3800 });
    expect(next.state.rearmEpoch).toBe(first.state.rearmEpoch);
  });

  it("ignores a stale sample from an already ended earlier window", () => {
    const saved = evaluateGraphqlQuotaWarning(bands, sample(4900, 100), null);
    const stale = { ...sample(10, 4990), resetAt: saved.state.resetAt - 3600 };
    const next = evaluateGraphqlQuotaWarning(bands, stale, saved.state, saved.state.resetAt - 60);

    expect(next.warning).toBeUndefined();
    expect(next.state).toMatchObject({
      lastRemaining: 4900,
      lastUsed: 100,
      resetAt: saved.state.resetAt,
    });
  });

  it("still merges a jittered earlier reset whose window has not ended", () => {
    const saved = evaluateGraphqlQuotaWarning(bands, sample(4900, 100), null);
    const jittered = { ...sample(900, 4100), resetAt: saved.state.resetAt - 1 };
    const next = evaluateGraphqlQuotaWarning(
      bands,
      jittered,
      saved.state,
      saved.state.resetAt - 60,
    );

    expect(next.warning?.thresholdPercent).toBe(20);
    expect(next.state).toMatchObject({ lastRemaining: 900, resetAt: saved.state.resetAt });
  });

  it("re-arms when the credential fingerprint changes in the same window", () => {
    const first = evaluateGraphqlQuotaWarning(bands, sample(1200, 3800), null);
    const switched = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1400, 3600), credentialFingerprint: fingerprintB },
      first.state,
    );

    expect(switched.warning?.thresholdPercent).toBe(30);
    expect(switched.state.rearmEpoch).toBe(first.state.rearmEpoch + 1);
    expect(switched.state.credentialFingerprint).toBe(fingerprintB);
    expect(switched.state.lastUsed).toBe(3600);
  });

  it("re-arms on window rollover and on a limit change", () => {
    const first = evaluateGraphqlQuotaWarning(bands, sample(1200, 3800), null);
    const rolled = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1400, 3600), resetAt: first.state.resetAt + 3600 },
      first.state,
      first.state.resetAt,
    );
    const limited = evaluateGraphqlQuotaWarning(
      bands,
      { ...sample(1000, 3000), limit: 4000 },
      first.state,
    );

    expect(rolled.warning?.thresholdPercent).toBe(30);
    expect(rolled.state.rearmEpoch).toBe(first.state.rearmEpoch + 1);
    expect(limited.warning?.thresholdPercent).toBe(30);
    expect(limited.state.rearmEpoch).toBe(first.state.rearmEpoch + 1);
    expect(limited.state.limit).toBe(4000);
  });
});
