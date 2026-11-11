import { filtersParam } from "./filters.mts";
import { parseEnvelopes } from "./envelope.mts";
import type {
  EventDeps,
  EventEnvelope,
  EventTransport,
  OwnerScope,
  TransportResult,
} from "./types.mts";

const RELAY_POLL_MS = 15_000;
/** Per-request bound the default fetch applies (proxy-aware `githubFetch`). */
export const RELAY_REQUEST_TIMEOUT_MS = 10_000;
const PAGE_LIMIT = 100;
/** `more: true` repolls at once; this bounds a runaway relay. */
const MAX_PAGES = 20;

interface RelayPage {
  events?: unknown;
  cursor?: unknown;
  gap?: unknown;
  more?: unknown;
}

type OwnerOutcome =
  | { kind: "ok"; events: EventEnvelope[]; failure?: string }
  | { kind: "uncovered"; reason: string };

/**
 * Polls the relay's `GET /events`, one request per owner (DynamoDB partitions by owner). Cursors
 * are opaque and echoed back exactly; the only one constructed is the bare epoch-ms start.
 */
export function createRelayTransport(
  config: { url: string; token: string },
  startMs: number,
  deps: Pick<EventDeps, "fetch">,
): EventTransport {
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const cursors = new Map<string, string>();
  let filtersRejected = false;
  let notice: string | undefined;

  async function pollOwner(scope: OwnerScope): Promise<OwnerOutcome> {
    const events: EventEnvelope[] = [];
    let failure: string | undefined;
    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({ owner: scope.owner });
        if (scope.repos.length > 0) params.set("repos", scope.repos.join(","));
        params.set("after", cursors.get(scope.owner) ?? String(startMs));
        params.set("limit", String(PAGE_LIMIT));
        params.set("payload", "0");
        const filters = filtersRejected ? undefined : filtersParam(scope.filters);
        if (filters) params.set("filters", filters);
        const response = await deps.fetch(new URL(`events?${params}`, base), {
          headers: { authorization: `Bearer ${config.token}` },
        });
        if (response.status === 401 || response.status === 403) {
          return { kind: "uncovered", reason: `relay answered HTTP ${response.status}` };
        }
        if (response.status === 400 && filters) {
          filtersRejected = true;
          notice = "events: relay rejected `filters` (HTTP 400); matching locally without them";
          page -= 1;
          continue;
        }
        if (!response.ok) {
          failure = `relay answered HTTP ${response.status}`;
          break;
        }
        const body = (await response.json()) as RelayPage | null;
        if (body === null || typeof body.cursor !== "string" || !Array.isArray(body.events)) {
          failure = "relay returned a malformed page";
          break;
        }
        cursors.set(scope.owner, body.cursor);
        events.push(...parseEnvelopes(body.events));
        if (body.gap === true) failure = "relay reported a gap (cursor older than retention)";
        if (body.more !== true) break;
      }
    } catch (error) {
      failure = `relay request failed (${error instanceof Error ? error.name : "error"})`;
    }
    return { kind: "ok", events, ...(failure && { failure }) };
  }

  return {
    intervalMs: RELAY_POLL_MS,
    async poll(scopes): Promise<TransportResult> {
      const outcomes = await Promise.all(scopes.map(pollOwner));
      const result: TransportResult = { events: [], ...(notice && { notice }) };
      notice = undefined;
      outcomes.forEach((outcome, index) => {
        if (outcome.kind === "ok") {
          result.events.push(...outcome.events);
          if (outcome.failure) result.unhealthy = outcome.failure;
        } else {
          (result.uncovered ??= []).push({ owner: scopes[index]!.owner, reason: outcome.reason });
        }
      });
      return result;
    },
    close() {},
  };
}
