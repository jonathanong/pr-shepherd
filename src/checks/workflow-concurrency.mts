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
  return { raw: `cancel-in-progress=${scalar(value)}`, cancelInProgress: value === true };
}
