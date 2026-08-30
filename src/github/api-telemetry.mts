import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiResourceUsage, ApiUsage, GraphqlApiUsage } from "../types.mts";
import type { RateLimitInfo } from "./http-utils.mts";

const GRAPHQL_RATE_LIMIT_ALIAS = "_shepherdRateLimit";

export interface ApiTelemetryEvent {
  kind: "GraphQL" | "REST";
  method: string;
  authSource: string;
  rateLimit?: RateLimitInfo;
}

interface GraphqlRateLimitPayload {
  cost: number;
  limit: number;
  nodeCount: number;
  remaining: number;
  resetAt: string;
  used: number;
}

const eventStorage = new AsyncLocalStorage<ApiTelemetryEvent[]>();

function events(): ApiTelemetryEvent[] | undefined {
  return eventStorage.getStore();
}

/** Isolates a top-level CLI/MCP command while allowing nested iterate ticks to aggregate. */
export function withApiTelemetryScope<T>(fn: () => Promise<T>): Promise<T> {
  if (eventStorage.getStore() !== undefined) return fn();
  return eventStorage.run([], fn);
}

export function snapshotApiTelemetry(): number {
  return events()?.length ?? 0;
}

export function recordApiTelemetry(event: ApiTelemetryEvent): void {
  events()?.push({ ...event, rateLimit: event.rateLimit ? { ...event.rateLimit } : undefined });
}

export function mergeGraphqlRateLimit(
  headerRateLimit: RateLimitInfo | null,
  data: unknown,
): RateLimitInfo | null {
  const payload = extractGraphqlRateLimit(data);
  if (headerRateLimit === null && payload === null) return null;
  const resetAt = payload === null ? undefined : Date.parse(payload.resetAt) / 1000;
  const fallback: RateLimitInfo | null =
    payload !== null && Number.isFinite(resetAt)
      ? {
          limit: payload.limit,
          used: payload.used,
          remaining: payload.remaining,
          resetAt: resetAt as number,
          resource: "graphql",
        }
      : null;
  const base = headerRateLimit ?? fallback;
  if (base === null) return null;
  return {
    ...base,
    resource: base.resource ?? "graphql",
    ...(payload !== null && Number.isFinite(payload.cost) && { cost: payload.cost }),
    ...(payload !== null && Number.isFinite(payload.nodeCount) && { nodeCount: payload.nodeCount }),
  };
}

export function summarizeApiTelemetry(snapshot = 0): ApiUsage | undefined {
  const selected = events()?.slice(snapshot);
  if (selected === undefined) return undefined;
  if (selected.length === 0) return undefined;
  const credentialSources = [...new Set(selected.map((event) => event.authSource))];
  const graphqlEvents = selected.filter((event) => event.kind === "GraphQL");
  const restEvents = selected.filter((event) => event.kind === "REST");
  const graphql = summarizeGraphql(graphqlEvents);
  const rest = summarizeRest(restEvents);
  return {
    credentialSources,
    ...(graphql !== undefined && { graphql }),
    ...(rest.length > 0 && { rest }),
  };
}

function summarizeGraphql(selected: ApiTelemetryEvent[]): GraphqlApiUsage | undefined {
  const latest = [...selected].reverse().find((event) => event.rateLimit !== undefined)?.rateLimit;
  if (latest === undefined) return undefined;
  return {
    ...resourceUsage(latest, selected.length, "graphql"),
    measuredQueryCost: selected.reduce((sum, event) => sum + (event.rateLimit?.cost ?? 0), 0),
    unmeasuredRequestCount: selected.filter((event) => event.rateLimit?.cost === undefined).length,
    nodeCount: selected.reduce((sum, event) => sum + (event.rateLimit?.nodeCount ?? 0), 0),
  };
}

function summarizeRest(selected: ApiTelemetryEvent[]): ApiResourceUsage[] {
  const groups = new Map<string, ApiTelemetryEvent[]>();
  for (const event of selected) {
    const resource = event.rateLimit?.resource ?? "unknown";
    const group = groups.get(resource) ?? [];
    group.push(event);
    groups.set(resource, group);
  }
  return [...groups.entries()].flatMap(([resource, group]) => {
    const latest = [...group].reverse().find((event) => event.rateLimit !== undefined)?.rateLimit;
    return latest ? [resourceUsage(latest, group.length, resource)] : [];
  });
}

function resourceUsage(
  rateLimit: RateLimitInfo,
  requestCount: number,
  fallbackResource: string,
): ApiResourceUsage {
  return {
    resource: rateLimit.resource ?? fallbackResource,
    requestCount,
    limit: rateLimit.limit,
    ...(rateLimit.used !== undefined && { used: rateLimit.used }),
    remaining: rateLimit.remaining,
    resetAt: rateLimit.resetAt,
  };
}

function extractGraphqlRateLimit(data: unknown): GraphqlRateLimitPayload | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>)[GRAPHQL_RATE_LIMIT_ALIAS];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !Number.isFinite(record["cost"]) ||
    !Number.isFinite(record["limit"]) ||
    !Number.isFinite(record["nodeCount"]) ||
    !Number.isFinite(record["remaining"]) ||
    typeof record["resetAt"] !== "string" ||
    !Number.isFinite(record["used"])
  ) {
    return null;
  }
  return record as unknown as GraphqlRateLimitPayload;
}
