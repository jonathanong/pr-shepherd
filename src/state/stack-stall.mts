/**
 * Persistent stall-detection state for an aggregate `--stack` selection whose open layers can
 * only wait. Keyed by native stack number because the anchor PR can merge or change.
 *
 * State lives in `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/stack-<number>/stack-stall.json`.
 */

import { resolveStackStatePath } from "./base.mts";
import { stallStateStore, type StallStateStore } from "./stall-state-store.mts";

type Store = StallStateStore<{ owner: string; repo: string; stack: number }>;

const store: Store = stallStateStore((key) => resolveStackStatePath(key, "stack-stall.json"));

export const readStackStallState: Store["read"] = store.read;
export const writeStackStallState: Store["write"] = store.write;
export const clearStackStallState: Store["clear"] = store.clear;
