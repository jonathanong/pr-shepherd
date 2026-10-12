const legacyDispatcherSlot = Symbol.for("undici.globalDispatcher.1");

/**
 * Undici 8's import installs a default agent and copies it onto the legacy
 * dispatcher slot that Node 22 and 24's fetch still reads. Put the host's
 * value back afterwards. The current slot stays writable, so a later
 * setGlobalDispatcher() can replace it and mirror that change onto fetch.
 */
function restoreLegacyDispatcher(previous: PropertyDescriptor | undefined, slot: symbol): void {
  if (previous) {
    Object.defineProperty(globalThis, slot, previous);
    return;
  }
  const installed = Object.getOwnPropertyDescriptor(globalThis, slot);
  // Undici defines this property as non-configurable, so absence can only be
  // represented by clearing the value.
  if (!installed?.writable) return;
  Object.defineProperty(globalThis, slot, {
    value: undefined,
    writable: true,
    enumerable: false,
    configurable: false,
  });
}

/**
 * Load Undici and put the host's legacy dispatcher back when this load replaced
 * it. `load` must be synchronous so a concurrent setGlobalDispatcher() cannot
 * land in the slot and then be overwritten by the restore.
 */
export function loadUndiciKeepingLegacyDispatcher<T>(
  load: () => T,
  slot: symbol = legacyDispatcherSlot,
): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, slot);
  const previousValue = previous?.value;
  try {
    const loaded = load();
    if (Object.getOwnPropertyDescriptor(globalThis, slot)?.value !== previousValue) {
      restoreLegacyDispatcher(previous, slot);
    }
    return loaded;
  } catch (error) {
    restoreLegacyDispatcher(previous, slot);
    throw error;
  }
}
