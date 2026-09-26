import { loadConfig } from "../config/load.mts";
import {
  configuredMergeMethod,
  mergeMethodFlag,
  type MergeMethod,
} from "../config/merge-method.mts";

/** Stack commands prefer squash unless config or the repository selects another method. */
export function stackMergeFlag(
  allowed: readonly MergeMethod[] | undefined,
): { flag: string } | { unavailable: string } {
  return mergeMethodFlag(allowed, "squash", configuredMergeMethod(loadConfig().merge ?? {}));
}
