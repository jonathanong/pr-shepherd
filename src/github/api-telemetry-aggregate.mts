import type { ApiTelemetryEvent } from "./api-telemetry.mts";
import type { RateLimitInfo } from "./http-utils.mts";
import { adoptGraphqlRateLimit, adoptRestRateLimit } from "./api-telemetry-adopt.mts";

export interface RestTelemetryGroup {
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
  /** Headerless REST responses (not 304s), kept out of every resource group: the proxy's `ccr` routes. */
  unmeteredRestRequestCount: number;
  /**
   * GitHub App installation requests, kept apart so the fields above describe only the user's
   * token chain. Keyed by installation source; each value's own `apps` is empty.
   */
  apps: Map<string, TelemetryAggregate>;
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
    apps: new Map(),
  };
}

export function aggregateEvents(events: SequencedApiTelemetryEvent[]): TelemetryAggregate {
  const aggregate = emptyAggregate();
  const appEvents = new Map<string, SequencedApiTelemetryEvent[]>();
  for (const event of events) {
    aggregate.eventCount += 1;
    if (event.githubApp) {
      const group = appEvents.get(event.authSource) ?? [];
      group.push(event);
      appEvents.set(event.authSource, group);
      continue;
    }
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
      aggregate.unmeteredRestRequestCount += 1;
      continue;
    }
    const resource = event.rateLimit?.resource ?? (event.notModified ? "core" : "unknown");
    const group = aggregate.rest.get(resource) ?? { requestCount: 0, notModifiedCount: 0 };
    if (event.notModified) group.notModifiedCount += 1;
    else group.requestCount += 1;
    const sample = event.rateLimit;
    if (sample) adoptRestRateLimit(group, sample, event.credentialFingerprint, event.sequence);
    aggregate.rest.set(resource, group);
  }
  for (const [source, group] of appEvents) {
    // Re-aggregate as a plain chain: clearing the flag keeps the nested pass from splitting again.
    const chain = group.map((event) => ({ ...event, githubApp: false }));
    aggregate.apps.set(source, aggregateEvents(chain));
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
  for (const [appSource, sourceApp] of source.apps) {
    const targetApp = target.apps.get(appSource) ?? emptyAggregate();
    mergeAggregate(targetApp, sourceApp);
    target.apps.set(appSource, targetApp);
  }
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
