import type { ApiTelemetryEvent } from "./api-telemetry.mts";
import type { RateLimitInfo } from "./http-utils.mts";

interface RestTelemetryGroup {
  requestCount: number;
  rateLimit?: RateLimitInfo;
  /** Fingerprint for the credential that produced the selected quota sample. */
  credentialFingerprint?: string;
  /** Newest observed credential and sequence, even if its sample did not win quota selection. */
  latestCredentialFingerprint?: string;
  latestCredentialSequence?: number;
}

export interface TelemetryAggregate {
  eventCount: number;
  credentialSources: Map<string, number>;
  graphql: {
    requestCount: number;
    measuredQueryCost: number;
    unmeasuredRequestCount: number;
    nodeCount: number;
    rateLimit?: RateLimitInfo;
    credentialFingerprint?: string;
  };
  rest: Map<string, RestTelemetryGroup>;
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
        adoptGraphqlRateLimit(aggregate.graphql, event.rateLimit, event.credentialFingerprint);
      }
      continue;
    }
    const resource = event.rateLimit?.resource ?? "unknown";
    const group = aggregate.rest.get(resource) ?? { requestCount: 0 };
    group.requestCount += 1;
    if (event.rateLimit !== undefined) {
      adoptRestRateLimit(group, event.rateLimit, event.credentialFingerprint, event.sequence);
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
    adoptGraphqlRateLimit(
      target.graphql,
      source.graphql.rateLimit,
      source.graphql.credentialFingerprint,
    );
  }
  for (const [resource, sourceGroup] of source.rest) {
    const targetGroup = target.rest.get(resource) ?? { requestCount: 0 };
    targetGroup.requestCount += sourceGroup.requestCount;
    if (sourceGroup.rateLimit !== undefined) {
      adoptRestRateLimit(
        targetGroup,
        sourceGroup.rateLimit,
        sourceGroup.credentialFingerprint,
        sourceGroup.latestCredentialSequence,
        sourceGroup.latestCredentialFingerprint ?? sourceGroup.credentialFingerprint,
        sourceGroup.latestCredentialSequence,
      );
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

function adoptGraphqlRateLimit(
  graphql: TelemetryAggregate["graphql"],
  candidate: RateLimitInfo,
  fingerprint: string | undefined,
): void {
  const next = selectAuthoritativeRateLimit(graphql.rateLimit, candidate);
  if (next !== graphql.rateLimit) graphql.credentialFingerprint = fingerprint;
  graphql.rateLimit = next;
}

function adoptRestRateLimit(
  group: RestTelemetryGroup,
  candidate: RateLimitInfo,
  fingerprint: string | undefined,
  sequence: number | undefined,
  latestCredentialFingerprint: string | undefined = fingerprint,
  latestCredentialSequence: number | undefined = sequence,
): void {
  const credentialChanged =
    group.latestCredentialFingerprint !== undefined &&
    latestCredentialFingerprint !== undefined &&
    group.latestCredentialFingerprint !== latestCredentialFingerprint;
  const olderCredentialObservation =
    credentialChanged &&
    group.latestCredentialSequence !== undefined &&
    latestCredentialSequence !== undefined &&
    latestCredentialSequence < group.latestCredentialSequence;
  if (olderCredentialObservation) return;

  if (group.rateLimit === undefined || credentialChanged) {
    group.rateLimit = { ...candidate };
    group.credentialFingerprint = fingerprint;
  } else {
    const next = selectAuthoritativeRateLimit(group.rateLimit, candidate);
    if (next !== group.rateLimit) {
      group.rateLimit = next;
      group.credentialFingerprint = fingerprint;
    }
  }

  if (
    latestCredentialFingerprint !== undefined &&
    (group.latestCredentialSequence === undefined ||
      latestCredentialSequence === undefined ||
      latestCredentialSequence >= group.latestCredentialSequence)
  ) {
    group.latestCredentialFingerprint = latestCredentialFingerprint;
    group.latestCredentialSequence = latestCredentialSequence;
  }
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
