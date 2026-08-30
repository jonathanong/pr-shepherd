import type { ApiTelemetryEvent } from "./api-telemetry.mts";
import type { RateLimitInfo } from "./http-utils.mts";

export interface TelemetryAggregate {
  eventCount: number;
  credentialSources: Map<string, number>;
  graphql: {
    requestCount: number;
    measuredQueryCost: number;
    unmeasuredRequestCount: number;
    nodeCount: number;
    rateLimit?: RateLimitInfo;
  };
  rest: Map<
    string,
    { requestCount: number; rateLimit?: RateLimitInfo; rateLimitSequence?: number }
  >;
}

export interface SequencedApiTelemetryEvent extends ApiTelemetryEvent {
  sequence: number;
}

export interface TelemetryStore {
  events: SequencedApiTelemetryEvent[];
  compacted: TelemetryAggregate;
  eventCount: number;
  clock: { next: number };
}

export function emptyAggregate(): TelemetryAggregate {
  return {
    eventCount: 0,
    credentialSources: new Map(),
    graphql: { requestCount: 0, measuredQueryCost: 0, unmeasuredRequestCount: 0, nodeCount: 0 },
    rest: new Map(),
  };
}

export function aggregateEvents(events: SequencedApiTelemetryEvent[]): TelemetryAggregate {
  const aggregate = emptyAggregate();
  for (const event of events) {
    aggregate.eventCount += 1;
    if (!aggregate.credentialSources.has(event.authSource)) {
      aggregate.credentialSources.set(event.authSource, event.sequence);
    }
    if (event.kind === "GraphQL") {
      aggregate.graphql.requestCount += 1;
      if (event.rateLimit?.cost === undefined) aggregate.graphql.unmeasuredRequestCount += 1;
      else aggregate.graphql.measuredQueryCost += event.rateLimit.cost;
      aggregate.graphql.nodeCount += event.rateLimit?.nodeCount ?? 0;
      if (event.rateLimit !== undefined) {
        aggregate.graphql.rateLimit = selectAuthoritativeRateLimit(
          aggregate.graphql.rateLimit,
          event.rateLimit,
        );
      }
      continue;
    }
    const resource = event.rateLimit?.resource ?? "unknown";
    const group = aggregate.rest.get(resource) ?? { requestCount: 0 };
    group.requestCount += 1;
    if (event.rateLimit !== undefined) {
      group.rateLimit = { ...event.rateLimit };
      group.rateLimitSequence = event.sequence;
    }
    aggregate.rest.set(resource, group);
  }
  return aggregate;
}

export function mergeAggregate(target: TelemetryAggregate, source: TelemetryAggregate): void {
  target.eventCount += source.eventCount;
  for (const [credentialSource, sequence] of source.credentialSources) {
    const current = target.credentialSources.get(credentialSource);
    if (current === undefined || sequence < current) {
      target.credentialSources.set(credentialSource, sequence);
    }
  }
  target.graphql.requestCount += source.graphql.requestCount;
  target.graphql.measuredQueryCost += source.graphql.measuredQueryCost;
  target.graphql.unmeasuredRequestCount += source.graphql.unmeasuredRequestCount;
  target.graphql.nodeCount += source.graphql.nodeCount;
  if (source.graphql.rateLimit !== undefined) {
    target.graphql.rateLimit = selectAuthoritativeRateLimit(
      target.graphql.rateLimit,
      source.graphql.rateLimit,
    );
  }
  for (const [resource, sourceGroup] of source.rest) {
    const targetGroup = target.rest.get(resource) ?? { requestCount: 0 };
    targetGroup.requestCount += sourceGroup.requestCount;
    if (
      sourceGroup.rateLimit !== undefined &&
      (targetGroup.rateLimitSequence === undefined ||
        (sourceGroup.rateLimitSequence ?? -1) > targetGroup.rateLimitSequence)
    ) {
      targetGroup.rateLimit = { ...sourceGroup.rateLimit };
      targetGroup.rateLimitSequence = sourceGroup.rateLimitSequence;
    }
    target.rest.set(resource, targetGroup);
  }
}

export function aggregateStore(active: TelemetryStore): TelemetryAggregate {
  const all = emptyAggregate();
  mergeAggregate(all, active.compacted);
  mergeAggregate(all, aggregateEvents(active.events));
  return all;
}

function selectAuthoritativeRateLimit(
  current: RateLimitInfo | undefined,
  candidate: RateLimitInfo,
): RateLimitInfo {
  if (current === undefined) return { ...candidate };
  if (candidate.resetAt !== current.resetAt) {
    return candidate.resetAt > current.resetAt ? { ...candidate } : current;
  }
  if (candidate.remaining !== current.remaining) {
    return candidate.remaining < current.remaining ? { ...candidate } : current;
  }
  if (candidate.used !== current.used) {
    if (candidate.used === undefined) return current;
    if (current.used === undefined || candidate.used > current.used) return { ...candidate };
  }
  return current;
}
