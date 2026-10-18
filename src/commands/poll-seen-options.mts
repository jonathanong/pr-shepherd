import type { IterateResult } from "../types.mts";

/**
 * Seen-state options for one poll tick. The loop discards a fix_code inside the debounce window
 * and polls past a mark_ready under `--merge`/`--until-terminal`; iterate holds edits on those.
 */
export function pollTickSeenOptions(
  debounceSeconds: number,
  pastDebounce: boolean,
  swallowsMarkReady: boolean,
) {
  const discardedActions: IterateResult["action"][] = [];
  if (!pastDebounce && debounceSeconds > 0) discardedActions.push("fix_code");
  if (!pastDebounce && swallowsMarkReady) discardedActions.push("mark_ready");
  return { persistSeen: debounceSeconds === 0 || pastDebounce, discardedActions };
}
