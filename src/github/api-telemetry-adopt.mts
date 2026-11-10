import type { RateLimitInfo } from "./http-utils.mts";
import { mostConservativeSample } from "./rate-limit-sample.mts";
import type { RestTelemetryGroup, TelemetryAggregate } from "./api-telemetry-aggregate.mts";

export function adoptGraphqlRateLimit(
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

export function adoptRestRateLimit(
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
