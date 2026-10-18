/**
 * Seen-state options for one poll tick. The loop can discard or refresh a tick's result, so
 * edited-comment markers are written only for the result it returns.
 */
export function pollTickSeenOptions(debounceSeconds: number, pastDebounce: boolean) {
  return { persistSeen: debounceSeconds === 0 || pastDebounce, deferEditedCommentMarkers: true };
}
