import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiResourceUsage, ApiUsage, GraphqlApiUsage } from "../types.mts";
import {
  aggregateEvents,
  aggregateStore,
  emptyAggregate,
  mergeAggregate,
  type TelemetryAggregate,
  type TelemetryStore,
} from "./api-telemetry-aggregate.mts";
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

const eventStorage = new AsyncLocalStorage<TelemetryStore>();

function store(): TelemetryStore | undefined {
  return eventStorage.getStore();
}

/** Isolates a top-level CLI/MCP command while allowing nested iterate ticks to aggregate. */
export function withApiTelemetryScope<T>(fn: () => Promise<T>): Promise<T> {
  const parent = store();
  const child: TelemetryStore = {
    events: [],
    compacted: emptyAggregate(),
    eventCount: 0,
    clock: parent?.clock ?? { next: 0 },
  };
  return eventStorage.run(child, async () => {
    try {
      return await fn();
    } finally {
      mergeAggregate(child.compacted, aggregateEvents(child.events));
      child.events = [];
      if (parent !== undefined) {
        mergeAggregate(parent.compacted, aggregateEvents(parent.events));
        parent.events = [];
        mergeAggregate(parent.compacted, child.compacted);
        parent.eventCount += child.eventCount;
      }
    }
  });
}

export function recordApiTelemetry(event: ApiTelemetryEvent): void {
  const active = store();
  if (active === undefined) return;
  active.events.push({
    ...event,
    rateLimit: event.rateLimit ? { ...event.rateLimit } : undefined,
    sequence: active.clock.next++,
  });
  active.eventCount += 1;
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

export function summarizeApiTelemetry(): ApiUsage | undefined {
  const active = store();
  if (active === undefined) return undefined;
  const selected = aggregateStore(active);
  if (selected.eventCount === 0) return undefined;
  const credentialSources = [...selected.credentialSources.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([source]) => source);
  const graphql = summarizeGraphql(selected.graphql);
  const rest = summarizeRest(selected.rest);
  return {
    credentialSources,
    ...(graphql !== undefined && { graphql }),
    ...(rest.length > 0 && { rest }),
  };
}

function summarizeGraphql(selected: TelemetryAggregate["graphql"]): GraphqlApiUsage | undefined {
  const rateLimit = selected.rateLimit;
  if (rateLimit === undefined) return undefined;
  return {
    ...resourceUsage(rateLimit, selected.requestCount, "graphql"),
    measuredQueryCost: selected.measuredQueryCost,
    unmeasuredRequestCount: selected.unmeasuredRequestCount,
    nodeCount: selected.nodeCount,
  };
}

function summarizeRest(selected: TelemetryAggregate["rest"]): ApiResourceUsage[] {
  return [...selected.entries()].flatMap(([resource, group]) => {
    return group.rateLimit ? [resourceUsage(group.rateLimit, group.requestCount, resource)] : [];
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
