/**
 * Persistent stall-detection state for the iterate loop.
 *
 * Tracks the fingerprint of the last iterate result and when that fingerprint
 * was first seen. If the fingerprint does not change for stallTimeoutSeconds
 * the iterate command escalates instead of repeating the same action.
 *
 * State lives in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/iterate-stall.json`.
 */

import { resolvePrStatePath } from "./base.mts";
import { stallStateStore, type StallStateStore } from "./stall-state-store.mts";

type Store = StallStateStore<{ owner: string; repo: string; pr: number }>;

const store: Store = stallStateStore((key) => resolvePrStatePath(key, "iterate-stall.json"));

export const readStallState: Store["read"] = store.read;
export const writeStallState: Store["write"] = store.write;
export const clearStallState: Store["clear"] = store.clear;
