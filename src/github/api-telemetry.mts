import { AsyncLocalStorage } from "node:async_hooks";
import {
  aggregateEvents,
  aggregateStore,
  emptyAggregate,
  mergeAggregate,
  type TelemetryStore,
} from "./api-telemetry-aggregate.mts";
import { summarizeAggregate } from "./api-telemetry-summary.mts";
import type { ApiUsage } from "../types.mts";
import type { RateLimitInfo } from "./http-utils.mts";

const GRAPHQL_RATE_LIMIT_ALIAS = "_shepherdRateLimit";

export interface ApiTelemetryEvent {
  kind: "GraphQL" | "REST";
  method: string;
  authSource: string;
  /** True when a GitHub App installation token answered this request, not the user's chain. */
  githubApp?: boolean;
  /** Truncated SHA-256 of the credential that produced this request. */
  credentialFingerprint?: string;
  rateLimit?: RateLimitInfo;
  /** HTTP 304 to a conditional read: consumes no primary quota, so it is not a counted request. */
  notModified?: boolean;
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

/** Fingerprint of the credential that owns the authoritative GraphQL rate-limit sample. */
function graphqlQuotaCredentialFingerprint(): string | undefined {
  const active = store();
  if (active === undefined) return undefined;
  return aggregateStore(active).graphql.credentialFingerprint;
}

/** Fingerprint of the credential that owns the authoritative REST core sample. */
function restCoreQuotaCredentialFingerprint(): string | undefined {
  const active = store();
  if (active === undefined) return undefined;
  return aggregateStore(active).rest.get("core")?.credentialFingerprint;
}

/** Attach the credential fingerprint without adding it when this command has none. */
export function withGraphqlCredentialFingerprint<T extends object>(sample: T): T {
  const credentialFingerprint = graphqlQuotaCredentialFingerprint();
  return credentialFingerprint === undefined ? sample : { ...sample, credentialFingerprint };
}

/** Attach the REST core credential fingerprint without exposing it in API usage output. */
export function withRestCoreCredentialFingerprint<T extends object>(sample: T): T {
  const credentialFingerprint = restCoreQuotaCredentialFingerprint();
  return credentialFingerprint === undefined ? sample : { ...sample, credentialFingerprint };
}

export function summarizeApiTelemetry(): ApiUsage | undefined {
  const active = store();
  return active === undefined ? undefined : summarizeAggregate(aggregateStore(active));
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
