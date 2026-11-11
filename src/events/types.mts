/** The envelope fields pr-shepherd reads. Events are wake signals; payloads are never used. */
export interface EventEnvelope {
  id: string;
  event: string;
  action?: string | null;
  repo: string | null;
  prs: number[];
  headSha: string | null;
  headRef: string | null;
  baseRef: string | null;
}

/** One watched PR. `headSha` and `headRef` are omitted when the tick never read them. */
export interface WatchTarget {
  repo: string;
  pr: number;
  headSha?: string;
  headRef?: string;
  baseRef?: string;
}

/** Relay-side bandwidth hint; the waiter always matches locally too. */
export type EventFilter = { pr: number[] } | { sha: string[] } | { ref: string[] };

export interface OwnerScope {
  owner: string;
  repos: string[];
  filters: EventFilter[];
}

export interface TransportResult {
  events: EventEnvelope[];
  /** A one-time note for the verbose progress and debug log. */
  notice?: string;
  /** The source could not be trusted this poll (5xx, network, gap, malformed). */
  unhealthy?: string;
  /** Owners the token cannot read; they stay uncovered for the rest of the run. */
  uncovered?: Array<{ owner: string; reason: string }>;
}

export interface EventTransport {
  /** Pause the waiter leaves between polls; 0 when `poll` blocks on its own. */
  intervalMs: number;
  /** Fetch new events; a blocking transport waits up to `waitMs` for one. */
  poll(scopes: OwnerScope[], waitMs: number): Promise<TransportResult>;
  close(): void;
}

export type EventsSourceConfig =
  | { kind: "relay"; url: string; token: string }
  | { kind: "serve"; url: string; token: string };

/** Injectable I/O so the sources are testable without a network. */
export interface EventDeps {
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
