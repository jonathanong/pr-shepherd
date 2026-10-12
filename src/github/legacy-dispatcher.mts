const legacyDispatcherSlot = Symbol.for("undici.globalDispatcher.1");

/**
 * Undici 8's import installs a default agent and copies it onto the legacy
 * dispatcher slot that Node 22 and 24's fetch still reads. Put the host's
 * value back afterwards. The current slot stays writable, so a later
 * setGlobalDispatcher() can replace it and mirror that change onto fetch.
 */
export function restoreLegacyDispatcher(previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(globalThis, legacyDispatcherSlot, previous);
    return;
  }
  const installed = Object.getOwnPropertyDescriptor(globalThis, legacyDispatcherSlot);
  // Undici defines this property as non-configurable, so absence can only be
  // represented by clearing the value.
  if (!installed?.writable) return;
  Object.defineProperty(globalThis, legacyDispatcherSlot, {
    value: undefined,
    writable: true,
    enumerable: false,
    configurable: false,
  });
}

export function readLegacyDispatcher(): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(globalThis, legacyDispatcherSlot);
}
