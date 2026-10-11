import type { ApiTelemetryEvent } from "./api-telemetry.mts";
import type { RateLimitInfo } from "./http-utils.mts";
import { mostConservativeSample } from "./rate-limit-sample.mts";

interface RestTelemetryGroup {
  /** Quota-consuming requests; 304 Not Modified responses are tallied separately. */
  requestCount: number;
  notModifiedCount: number;
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
  /** REST responses with no rate-limit sample at all (not 304s): the Claude Code proxy's `ccr` routes. */
  unmeteredRestRequestCount: number;
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
    unmeteredRestRequestCount: 0,
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
    if (event.rateLimit === undefined && !event.notModified) {
      // Headerless (unmetered) responses stay out of every resource group.
      aggregate.unmeteredRestRequestCount += 1;
      continue;
    }
    const resource = event.rateLimit?.resource ?? (event.notModified ? "core" : "unknown");
    const group = aggregate.rest.get(resource) ?? { requestCount: 0, notModifiedCount: 0 };
    if (event.notModified) group.notModifiedCount += 1;
    else group.requestCount += 1;
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
  target.unmeteredRestRequestCount += source.unmeteredRestRequestCount;
  if (source.graphql.rateLimit !== undefined) {
    adoptGraphqlRateLimit(
      target.graphql,
      source.graphql.rateLimit,
      source.graphql.credentialFingerprint,
    );
  }
  for (const [resource, sourceGroup] of source.rest) {
    const targetGroup = target.rest.get(resource) ?? { requestCount: 0, notModifiedCount: 0 };
    targetGroup.requestCount += sourceGroup.requestCount;
    targetGroup.notModifiedCount += sourceGroup.notModifiedCount;
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
  // Two credentials' samples are compared whole, never mixed: a mixed sample would be
  // attributed to whichever credential supplied the changed half.
  const sameCredential =
    fingerprint === undefined ||
    graphql.credentialFingerprint === undefined ||
    fingerprint === graphql.credentialFingerprint;
  const next = selectAuthoritativeRateLimit(graphql.rateLimit, candidate, sameCredential);
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
  sameCredential = true,
): RateLimitInfo {
  if (current === undefined) return { ...candidate };
  if (candidate.resetAt !== current.resetAt) {
    return candidate.resetAt > current.resetAt ? { ...candidate } : current;
  }
  if (!sameCredential) return candidate.remaining < current.remaining ? { ...candidate } : current;
  const merged = mostConservativeSample(current, candidate);
  return merged.remaining === current.remaining && merged.used === current.used ? current : merged;
}
