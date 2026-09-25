export interface ApiResourceUsage {
  resource: string;
  requestCount: number;
  limit: number;
  used?: number;
  remaining: number;
  resetAt: number;
  /** Truncated SHA-256 of the credential. Quota state only; summarized usage omits it. */
  credentialFingerprint?: string;
}

export interface GraphqlApiUsage extends ApiResourceUsage {
  /** Exact sum reported by rateLimit.cost for GraphQL queries in this command. */
  measuredQueryCost: number;
  /** Requests without an exact cost, principally GraphQL mutations. */
  unmeasuredRequestCount: number;
  /** Exact sum reported by rateLimit.nodeCount for measured GraphQL queries. */
  nodeCount: number;
}

/** One budget inside a combined GraphQL and REST core warning. */
export interface QuotaWarningBudget {
  resource: "graphql" | "core";
  thresholdPercent: number;
  remaining: number;
  limit: number;
  used?: number;
  resetAt: number;
}

export interface ApiUsage {
  credentialSources: string[];
  graphql?: GraphqlApiUsage;
  rest?: ApiResourceUsage[];
}

export interface GraphqlQuotaWarning {
  resource: "graphql" | "core" | "combined";
  thresholdPercent: number;
  remaining: number;
  limit: number;
  used?: number;
  resetAt: number;
  pollIntervalMinutes: number;
  pollTimeoutMinutes: number;
  /** Both budgets when GraphQL and REST core are low together. */
  budgets?: QuotaWarningBudget[];
}
