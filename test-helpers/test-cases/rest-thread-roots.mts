const REST_THREAD_ID = /^rest-thread-([1-9][0-9]*)$/;
const DISCUSSION_ROOT = /#discussion_r([1-9][0-9]*)$/;
/** First synthetic root for fixture threads whose URL carries no numeric discussion anchor. */
const SYNTHETIC_ROOT_BASE = 990000;

/**
 * The numeric root review comment ID behind each fixture thread, in thread order.
 *
 * `readRestFeedback` names a thread `rest-thread-<root comment id>`, so the REST variant needs
 * the root comment's numeric ID: an existing `rest-thread-N` ID, else the thread's (or its
 * first comment's) `#discussion_rN` URL anchor, else a synthetic root unique in the fixture.
 */
export function restThreadRoots(threads: Array<Record<string, unknown>>): string[] {
  const derived = threads.map((thread) => {
    const native = REST_THREAD_ID.exec(String(thread.id))?.[1];
    if (native) return native;
    const firstComment = Array.isArray(thread.comments) ? thread.comments[0] : undefined;
    return (
      DISCUSSION_ROOT.exec(String(thread.url ?? ""))?.[1] ??
      DISCUSSION_ROOT.exec(String(firstComment?.url ?? ""))?.[1]
    );
  });
  let next = SYNTHETIC_ROOT_BASE;
  const roots = derived.map((root) => root ?? String(next++));
  if (new Set(roots).size !== roots.length)
    throw new Error(`fixture review threads share a REST root comment: ${roots.join(", ")}`);
  return roots;
}
