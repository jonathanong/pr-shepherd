import { parse } from "yaml";

/** A workflow's top-level `concurrency.cancel-in-progress`, raw. */
export interface WorkflowConcurrency {
  /** Raw display value, e.g. `cancel-in-progress=true` or `none`. */
  raw: string;
  /** True only for the YAML boolean `true`; an expression is never treated as true. */
  cancelInProgress: boolean;
}

/** A group expression that changes with every push or run, so a newer run never shares it. */
const VOLATILE_GROUP =
  /github\.(sha|run_id|run_number|run_attempt|event\.(after|before|head_commit|pull_request\.head\.sha))|\bhead\.sha\b/i;

/**
 * False only when the workflow's `pull_request` / `pull_request_target` triggers all list
 * `types` without `synchronize`: a fix push then starts no replacement run to cancel the old one.
 */
function pushRetriggers(on: unknown): boolean {
  if (on === null || typeof on !== "object" || Array.isArray(on)) return true;
  const triggers = ["pull_request", "pull_request_target"]
    .map((name) => (on as Record<string, unknown>)[name])
    .filter((trigger) => trigger !== undefined);
  if (triggers.length === 0) return true;
  return triggers.some((trigger) => {
    const types =
      trigger !== null && typeof trigger === "object"
        ? (trigger as Record<string, unknown>)["types"]
        : undefined;
    return !Array.isArray(types) || types.includes("synchronize");
  });
}

function scalar(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Reads the workflow file's top-level `concurrency`. Returns `undefined` when it does not parse. */
export function parseWorkflowConcurrency(text: string): WorkflowConcurrency | undefined {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return undefined;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return undefined;
  const concurrency = (doc as Record<string, unknown>)["concurrency"];
  if (concurrency === undefined || concurrency === null) {
    return { raw: "none", cancelInProgress: false };
  }
  const value =
    typeof concurrency === "object" && !Array.isArray(concurrency)
      ? (concurrency as Record<string, unknown>)["cancel-in-progress"]
      : undefined;
  if (value === undefined) return { raw: "cancel-in-progress=unset", cancelInProgress: false };
  const group = (concurrency as Record<string, unknown>)["group"];
  if (value === true && typeof group === "string" && VOLATILE_GROUP.test(group)) {
    return { raw: "cancel-in-progress=true (group changes every push)", cancelInProgress: false };
  }
  if (value === true && !pushRetriggers((doc as Record<string, unknown>)["on"])) {
    return {
      raw: "cancel-in-progress=true (a push does not retrigger it)",
      cancelInProgress: false,
    };
  }
  return { raw: `cancel-in-progress=${scalar(value)}`, cancelInProgress: value === true };
}
