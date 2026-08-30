export interface ApiResourceUsage {
  resource: string;
  requestCount: number;
  limit: number;
  used?: number;
  remaining: number;
  resetAt: number;
}

export interface GraphqlApiUsage extends ApiResourceUsage {
  /** Exact sum reported by rateLimit.cost for GraphQL queries in this command. */
  measuredQueryCost: number;
  /** Requests without an exact cost, principally GraphQL mutations. */
  unmeasuredRequestCount: number;
  /** Exact sum reported by rateLimit.nodeCount for measured GraphQL queries. */
  nodeCount: number;
}

export interface ApiUsage {
  credentialSources: string[];
  graphql?: GraphqlApiUsage;
  rest?: ApiResourceUsage[];
}

export interface GraphqlQuotaWarning {
  resource: "graphql";
  thresholdPercent: number;
  remaining: number;
  limit: number;
  used?: number;
  resetAt: number;
  pollIntervalMinutes: number;
  pollTimeoutMinutes: number;
}
