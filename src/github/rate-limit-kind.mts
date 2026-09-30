import type { RateLimitInfo } from "./http-utils.mts";

export type RateLimitKind = "primary" | "secondary";

/** Interpret GitHub's throttle signals independently of the quota resource header. */
export function rateLimitKind(input: {
  status: number;
  message: string;
  responseMessage?: string;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
  graphqlErrors?: Array<{ message: string }>;
}): RateLimitKind | null {
  const exhausted = input.rateLimit !== undefined && input.rateLimit.remaining <= 0;
  const responseText = input.responseMessage ?? input.message;
  const graphqlMessages = (input.graphqlErrors ?? []).map((error) => error.message);
  const textThrottleCapable = input.status === 403 || input.status === 429;
  const explicitlySecondary = /secondary (?:rate )?limit|abuse detection/i;
  if (
    (textThrottleCapable && explicitlySecondary.test(responseText)) ||
    graphqlMessages.some((message) => explicitlySecondary.test(message))
  ) {
    return "secondary";
  }
  // A 429 with an empty primary bucket is an actual primary-limit response.
  if (input.status === 429 && exhausted) return "primary";
  if (exhausted) return "primary";
  if (
    input.status === 429 ||
    input.retryAfterSeconds !== undefined ||
    (textThrottleCapable && /\brate limit\b/i.test(responseText)) ||
    graphqlMessages.some((message) => /\brate limit\b/i.test(message))
  ) {
    // Without a measured empty bucket, do not spend REST core on a probe.
    return "secondary";
  }
  return null;
}
