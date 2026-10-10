import { beforeEach, describe, expect, it, vi } from "vitest";

const { evaluateWarning, restFingerprint } = vi.hoisted(() => ({
  evaluateWarning: vi.fn(),
  restFingerprint: { value: "rest-fingerprint" },
}));
vi.mock("../github/api-telemetry.mts", () => ({
  withGraphqlCredentialFingerprint: <T extends object>(sample: T) => ({
    ...sample,
    credentialFingerprint: "graphql-fingerprint",
  }),
  withRestCoreCredentialFingerprint: <T extends object>(sample: T) => ({
    ...sample,
    credentialFingerprint: restFingerprint.value,
  }),
}));
vi.mock("../state/graphql-quota-warnings.mts", () => ({
  evaluateWorktreeGraphqlQuotaWarning: evaluateWarning,
}));

import { GitHubRequestError } from "../github/errors.mts";
import {
  githubOperation,
  getGithubTransport,
  runWithGithubTransport,
} from "../github/transport.mts";
import type { ApiUsage } from "../types.mts";
import { selectQuotaWarning } from "./quota-selection.mts";

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];
const graphqlWarning = {
  resource: "graphql" as const,
  thresholdPercent: 10,
  remaining: 400,
  limit: 5000,
  resetAt: 2_000_000_000,
  pollIntervalMinutes: 10,
  pollTimeoutMinutes: 20,
};
const coreWarning = {
  ...graphqlWarning,
  resource: "core" as const,
  remaining: 400,
};
const usage: ApiUsage = {
  credentialSources: ["env"],
  graphql: {
    resource: "graphql",
    requestCount: 1,
    limit: 5000,
    used: 4600,
    remaining: 400,
    resetAt: 2_000_000_000,
    measuredQueryCost: 1,
    unmeasuredRequestCount: 0,
    nodeCount: 10,
  },
  rest: [
    {
      resource: "core",
      requestCount: 1,
      limit: 5000,
      used: 100,
      remaining: 4900,
      resetAt: 2_000_000_000,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  restFingerprint.value = "rest-fingerprint";
  evaluateWarning.mockImplementation(async (_key, _bands, sample) =>
    sample.resource === "graphql" ? graphqlWarning : undefined,
  );
});

describe("quota warning selection by active transport", () => {
  it("after primary GraphQL exhaustion, ignores its low telemetry when REST core is healthy", async () => {
    const result = await runWithGithubTransport("auto", async () => {
      await githubOperation(
        "quota probe",
        async () => {
          throw new GitHubRequestError("primary GraphQL budget exhausted", {
            status: 403,
            rateLimit: {
              resource: "graphql",
              remaining: 0,
              limit: 5000,
              resetAt: 2_000_000_000,
            },
          });
        },
        async () => "REST snapshot",
      );
      expect(getGithubTransport()).toBe("rest");
      return selectQuotaWarning({ owner: "acme", repo: "widgets" }, bands, usage, false, "rest");
    });

    expect(result).toBeUndefined();
    expect(evaluateWarning.mock.calls.map(([, , sample]) => sample.resource)).toEqual(["core"]);
    expect(evaluateWarning.mock.calls[0]?.[2]).toMatchObject({
      resource: "core",
      credentialFingerprint: "rest-fingerprint",
    });
  });

  it("warns on REST core depletion and preserves GraphQL-mode combined warnings", async () => {
    evaluateWarning.mockImplementation(async (_key, _bands, sample) =>
      sample.resource === "core" ? coreWarning : graphqlWarning,
    );
    const restUsage: ApiUsage = {
      ...usage,
      rest: [{ ...usage.rest![0]!, remaining: 400, used: 4600 }],
    };

    await expect(
      selectQuotaWarning({ owner: "acme", repo: "widgets" }, bands, restUsage, false, "rest"),
    ).resolves.toMatchObject({ resource: "core", remaining: 400 });
    expect(evaluateWarning.mock.calls[0]?.[2]).toMatchObject({
      resource: "core",
      credentialFingerprint: "rest-fingerprint",
    });
    expect(
      await selectQuotaWarning(
        { owner: "acme", repo: "widgets" },
        bands,
        restUsage,
        false,
        "graphql",
      ),
    ).toMatchObject({
      resource: "combined",
      budgets: [{ resource: "core" }, { resource: "graphql" }],
    });
    expect(evaluateWarning.mock.calls.at(-2)?.[2]).toMatchObject({
      resource: "graphql",
      credentialFingerprint: "graphql-fingerprint",
    });
    expect(evaluateWarning.mock.calls.at(-1)?.[2]).toMatchObject({
      resource: "core",
      credentialFingerprint: "rest-fingerprint",
    });
  });

  it("captures REST credential provenance before GraphQL warning evaluation yields", async () => {
    evaluateWarning.mockImplementation(async (_key, _bands, sample) => {
      if (sample.resource === "graphql") restFingerprint.value = "rotated-rest-fingerprint";
      return sample.resource === "graphql" ? graphqlWarning : undefined;
    });

    await selectQuotaWarning({ owner: "acme", repo: "widgets" }, bands, usage, false, "graphql");

    expect(evaluateWarning.mock.calls.map(([, , sample]) => sample.credentialFingerprint)).toEqual([
      "graphql-fingerprint",
      "rest-fingerprint",
    ]);
  });
});
