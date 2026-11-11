import type { EventEnvelope, WatchTarget } from "./types.mts";

const BASE_MOVE_EVENTS = new Set(["push", "pull_request"]);
const QUEUE_REF = /^gh-readonly-queue\/(.+)\/pr-(\d+)-/;

function branch(ref: string | null): string | null {
  return ref === null ? null : ref.replace(/^refs\/heads\//, "");
}

function queuedPr(ref: string | null): { base: string; pr: number } | null {
  const match = ref === null ? null : QUEUE_REF.exec(ref);
  return match ? { base: match[1]!, pr: Number(match[2]) } : null;
}

/**
 * True when `event` may change what an iterate tick sees for `target`. Deliberately generous:
 * a spurious wake costs one tick, a missed one costs up to the fallback interval.
 */
function matchesTarget(event: EventEnvelope, target: WatchTarget): boolean {
  if (event.repo?.toLowerCase() !== target.repo.toLowerCase()) return false;
  if (event.prs.includes(target.pr)) return true;
  if (target.headSha !== undefined && event.headSha?.toLowerCase() === target.headSha.toLowerCase())
    return true;
  const eventHead = branch(event.headRef);
  if (target.headRef !== undefined && eventHead === target.headRef) return true;
  const queued = queuedPr(eventHead);
  if (queued?.pr === target.pr && (target.baseRef === undefined || queued.base === target.baseRef))
    return true;
  if (target.baseRef === undefined || !BASE_MOVE_EVENTS.has(event.event)) return false;
  return eventHead === target.baseRef || branch(event.baseRef) === target.baseRef;
}

export function matchesAny(event: EventEnvelope, targets: readonly WatchTarget[]): boolean {
  return targets.some((target) => matchesTarget(event, target));
}
