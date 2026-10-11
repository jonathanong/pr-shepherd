import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";

/**
 * Where a GraphQL BaseBehind result may be cached. The count is a pure function of two commits,
 * so an entry keyed on the live base tip and the head commit never goes stale.
 */
export interface BaseBehindCacheOptions {
  stateKey: StateKey;
  /** Live base tip from the same tick's `BatchPr`; without it the cache is not read. */
  baseTipOid?: string;
  /** Derived-state slot; a stack layer keeps its trunk compare apart from its base compare. */
  slot?: "base-behind" | "trunk-behind";
}

interface BaseBehindEntry {
  baseTipOid: string;
  headOid: string;
  behindBy: number;
}

const COMMIT_OID = /^[0-9a-f]{40}$/;

export async function cachedBaseBehind(
  cache: BaseBehindCacheOptions | undefined,
  headOid: string,
): Promise<number | undefined> {
  if (!cache?.baseTipOid || !COMMIT_OID.test(headOid)) return undefined;
  const entry = await loadDerived<BaseBehindEntry>(cache.stateKey, cache.slot ?? "base-behind");
  const value = entry?.value;
  if (value?.baseTipOid !== cache.baseTipOid || value.headOid !== headOid) return undefined;
  return Number.isSafeInteger(value.behindBy) && value.behindBy >= 0 ? value.behindBy : undefined;
}

/** Stores a compare under the base tip it actually used, which may be newer than BatchPr's. */
export async function storeBaseBehind(
  cache: BaseBehindCacheOptions | undefined,
  baseTipOid: string | undefined,
  headOid: string,
  behindBy: number,
): Promise<void> {
  if (!cache || !baseTipOid || !COMMIT_OID.test(headOid)) return;
  const entry: BaseBehindEntry = { baseTipOid, headOid, behindBy };
  await storeDerived(cache.stateKey, cache.slot ?? "base-behind", entry);
}
