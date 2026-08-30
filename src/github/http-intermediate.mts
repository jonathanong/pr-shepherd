import { appendEntry } from "../log/log-file.mts";
import { formatResponseEntry } from "../log/session.mts";
import { recordApiTelemetry } from "./api-telemetry.mts";
import { parseRateLimit, parseRetryAfter } from "./http-utils.mts";

export function recordIntermediateResponse(opts: {
  n: number;
  kind: "GraphQL" | "REST" | "restText";
  method: string;
  url: string;
  response: Response;
  durationMs: number;
  authSource: string;
}): void {
  const rateLimit = parseRateLimit(opts.response.headers) ?? undefined;
  const retryAfterSeconds = parseRetryAfter(opts.response.headers);
  appendEntry(
    formatResponseEntry({
      ...opts,
      status: opts.response.status,
      rateLimit,
      retryAfterSeconds,
    }),
  );
  recordApiTelemetry({
    kind: opts.kind === "GraphQL" ? "GraphQL" : "REST",
    method: opts.method,
    authSource: opts.authSource,
    rateLimit,
  });
}
