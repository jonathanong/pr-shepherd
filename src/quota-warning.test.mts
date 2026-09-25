import { describe, expect, it } from "vitest";
import { formatQuotaWarning } from "./cli/api-usage-formatter.mts";
import { composeQuotaWarning } from "./quota-budgets.mts";
import { buildQuotaAwareContinuation } from "./quota-warning.mts";
import type { GraphqlQuotaWarning } from "./types.mts";

const graphql: GraphqlQuotaWarning = {
  resource: "graphql",
  thresholdPercent: 20,
  remaining: 900,
  limit: 5000,
  used: 4100,
  resetAt: 1_800_000_000,
  pollIntervalMinutes: 5,
  pollTimeoutMinutes: 10,
};

const core: GraphqlQuotaWarning = {
  resource: "core",
  thresholdPercent: 10,
  remaining: 400,
  limit: 5000,
  used: 4600,
  resetAt: 1_800_003_600,
  pollIntervalMinutes: 10,
  pollTimeoutMinutes: 20,
};

const combined: GraphqlQuotaWarning = {
  resource: "combined",
  thresholdPercent: 10,
  remaining: 400,
  limit: 5000,
  used: 4600,
  resetAt: 1_800_003_600,
  pollIntervalMinutes: 10,
  pollTimeoutMinutes: 20,
  budgets: [
    {
      resource: "core",
      thresholdPercent: 10,
      remaining: 400,
      limit: 5000,
      used: 4600,
      resetAt: 1_800_003_600,
    },
    {
      resource: "graphql",
      thresholdPercent: 20,
      remaining: 900,
      limit: 5000,
      used: 4100,
      resetAt: 1_800_000_000,
    },
  ],
};

describe("quota warning text", () => {
  it("recommends REST only while GraphQL is the low budget", () => {
    const text = formatQuotaWarning(graphql);
    const instruction = buildQuotaAwareContinuation(graphql, "Continue.");
    expect(text).toContain("prefer REST `gh`");
    expect(instruction).toContain("non-GraphQL `gh` CLI commands");
    expect(instruction).toContain(
      `after the GraphQL quota resets at ${new Date(graphql.resetAt * 1000).toISOString()}`,
    );
  });

  it("does not recommend REST when REST core is the low budget", () => {
    const text = formatQuotaWarning(core) ?? "";
    const instruction = buildQuotaAwareContinuation(core, "Continue.");
    expect(text).not.toContain("prefer REST");
    expect(instruction).not.toContain("prefer non-GraphQL");
    expect(instruction).toContain("REST core quota is low");
    expect(instruction).toContain(
      `after the REST core quota resets at ${new Date(core.resetAt * 1000).toISOString()}`,
    );
    expect(text).toContain("while REST core is low");
  });

  it("covers both budgets in one combined warning and does not recommend a switch", () => {
    const text = formatQuotaWarning(combined) ?? "";
    const instruction = buildQuotaAwareContinuation(combined, "Continue.");
    expect(text).toContain("Budget `core`");
    expect(text).toContain("Budget `graphql`");
    expect(text).toContain("do not shift work between them");
    expect(text).not.toContain("prefer REST");
    expect(instruction).toContain("GraphQL and REST core quotas are both low");
    expect(instruction).toContain("Do not shift incidental calls between GraphQL and REST");
    expect(instruction).toContain(
      `after both quotas have reset at ${new Date(combined.resetAt * 1000).toISOString()}`,
    );
    expect(instruction).not.toContain("prefer non-GraphQL");
  });

  it("combines a GraphQL warning with REST core that is already below its band", () => {
    const bands = [
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ];
    const warning = composeQuotaWarning({
      graphqlWarning: graphql,
      graphql: { resource: "graphql", remaining: 900, limit: 5000, resetAt: graphql.resetAt },
      core: { resource: "core", remaining: 400, limit: 5000, used: 4600, resetAt: core.resetAt },
      bands,
    });
    expect(warning?.resource).toBe("combined");
    expect(warning?.resetAt).toBe(core.resetAt);
    expect(warning?.budgets?.map((budget) => budget.resource)).toEqual(["core", "graphql"]);
    expect(formatQuotaWarning(warning)?.includes("prefer REST")).toBe(false);
  });

  it("combines a REST core warning with GraphQL that is already below its band", () => {
    const bands = [
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ];
    const warning = composeQuotaWarning({
      coreWarning: core,
      core: { resource: "core", remaining: 400, limit: 5000, resetAt: core.resetAt },
      graphql: { resource: "graphql", remaining: 900, limit: 5000, resetAt: graphql.resetAt },
      bands,
    });
    expect(warning?.resource).toBe("combined");
    expect(warning?.budgets?.map((budget) => budget.resource)).toEqual(["core", "graphql"]);
  });
});
