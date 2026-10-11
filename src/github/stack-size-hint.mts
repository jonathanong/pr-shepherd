import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";

/**
 * The stack size the anchor's last summary observed. It only sizes the next
 * summary page, so a stale value costs a page or a few unused slots, never a
 * wrong answer: `readStack` still validates the full membership.
 */
const STACK_SIZE_HINT = "stack-size";

export async function loadStackSizeHint(key: StateKey): Promise<number> {
  const value = (await loadDerived<number>(key, STACK_SIZE_HINT))?.value;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export async function storeStackSizeHint(key: StateKey, stackSize: number): Promise<void> {
  await storeDerived(key, STACK_SIZE_HINT, stackSize);
}
