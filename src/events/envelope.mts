import type { EventEnvelope } from "./types.mts";

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Keep only the fields pr-shepherd reads; additive envelope fields are ignored. */
export function parseEnvelope(raw: unknown): EventEnvelope | null {
  if (raw === null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value["id"] !== "string" || typeof value["event"] !== "string") return null;
  const prs = Array.isArray(value["prs"])
    ? value["prs"].filter((pr): pr is number => typeof pr === "number")
    : [];
  return {
    id: value["id"],
    event: value["event"],
    action: text(value["action"]),
    repo: text(value["repo"]),
    prs,
    headSha: text(value["headSha"]),
    headRef: text(value["headRef"]),
    baseRef: text(value["baseRef"]),
  };
}

export function parseEnvelopes(raw: unknown): EventEnvelope[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => parseEnvelope(item) ?? []);
}
