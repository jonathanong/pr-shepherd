import { parse } from "yaml";

/** A workflow's top-level `concurrency.cancel-in-progress`, raw. */
export interface WorkflowConcurrency {
  /** Raw display value, e.g. `cancel-in-progress=true` or `none`. */
  raw: string;
  /** True only for the YAML boolean `true`; an expression is never treated as true. */
  cancelInProgress: boolean;
}

/** Context values that stay the same across pushes to one pull request. */
const STABLE_CONTEXT = new Set([
  "github.workflow",
  "github.ref",
  "github.head_ref",
  "github.base_ref",
  "github.event_name",
  "github.repository",
  "github.event.number",
  "github.event.pull_request.number",
]);
const EXPRESSION_WORDS = new Set(["true", "false", "null", "format", "contains", "join"]);

/**
 * True only for a literal group, or one whose expressions use known push-stable context values.
 * Anything else (SHA, run id, index syntax, unknown values) is unverified, so no cancel is printed.
 */
function groupIsStable(group: string): boolean {
  const expressions = [...group.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((match) => match[1]!);
  return expressions.every((expression) => {
    const code = expression.replace(/'(?:[^']|'')*'/g, "");
    if (/[[\]]/.test(code)) return false;
    const names = code.match(/[A-Za-z_][\w.-]*/g) ?? [];
    return names.every((name) => STABLE_CONTEXT.has(name) || EXPRESSION_WORDS.has(name));
  });
}

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
  if (value === true && (typeof group !== "string" || !groupIsStable(group))) {
    return { raw: "cancel-in-progress=true (group not verified stable)", cancelInProgress: false };
  }
  if (value === true && !pushRetriggers((doc as Record<string, unknown>)["on"])) {
    return {
      raw: "cancel-in-progress=true (a push does not retrigger it)",
      cancelInProgress: false,
    };
  }
  return { raw: `cancel-in-progress=${scalar(value)}`, cancelInProgress: value === true };
}
