import { findMergeStrategies } from "./merge-command-args.mts";

export type MergeMethod = "merge" | "squash" | "rebase";

const METHOD_ORDER: readonly MergeMethod[] = ["merge", "squash", "rebase"];

export interface RepositoryMergeSettings {
  mergeCommitAllowed?: boolean;
  squashMergeAllowed?: boolean;
  rebaseMergeAllowed?: boolean;
}

/** `undefined` when the query did not select repository merge settings. */
export function readAllowedMergeMethods(
  repository: RepositoryMergeSettings | null | undefined,
): MergeMethod[] | undefined {
  if (
    !repository ||
    (repository.mergeCommitAllowed === undefined &&
      repository.squashMergeAllowed === undefined &&
      repository.rebaseMergeAllowed === undefined)
  ) {
    return undefined;
  }
  const allowed: MergeMethod[] = [];
  if (repository.mergeCommitAllowed) allowed.push("merge");
  if (repository.squashMergeAllowed) allowed.push("squash");
  if (repository.rebaseMergeAllowed) allowed.push("rebase");
  return allowed;
}

export function configuredMergeMethod(merge: {
  method?: MergeMethod;
  "command-args": string[];
}): MergeMethod | null {
  const fromArgs = findMergeStrategies(merge["command-args"])[0] as MergeMethod | undefined;
  return merge.method ?? fromArgs ?? null;
}

export function chooseMergeMethod(input: {
  allowed: readonly MergeMethod[] | undefined;
  configured: MergeMethod | null;
  fallback: MergeMethod;
  /** Branch policy requires linear history: a merge commit can never satisfy it. */
  linearHistory?: boolean;
}): { method: MergeMethod } | { unavailable: string } {
  if (input.linearHistory) {
    const linear = (input.allowed ?? METHOD_ORDER).filter((method) => method !== "merge");
    if (input.allowed !== undefined && linear.length === 0)
      return {
        unavailable:
          "Required linear history excludes merge commits, and this repository allows no squash or rebase merge.",
      };
    if (input.configured === "merge")
      return {
        unavailable:
          "Configured merge method `merge` conflicts with the required linear history; use `squash` or `rebase`.",
      };
    if (input.allowed === undefined) {
      return {
        method: input.configured ?? (input.fallback === "merge" ? "squash" : input.fallback),
      };
    }
    return chooseMergeMethod({ ...input, allowed: linear, linearHistory: false });
  }
  if (input.allowed === undefined) return { method: input.configured ?? input.fallback };
  if (input.configured) {
    if (input.allowed.includes(input.configured)) return { method: input.configured };
    const allowedText = input.allowed.length > 0 ? input.allowed.join(", ") : "none";
    return {
      unavailable: `Configured merge method \`${input.configured}\` is not allowed by this repository. Allowed methods: ${allowedText}.`,
    };
  }
  if (input.allowed.includes(input.fallback)) return { method: input.fallback };
  const method = METHOD_ORDER.find((item) => input.allowed?.includes(item));
  if (method) return { method };
  return {
    unavailable:
      "This repository allows no merge method (merge commits, squash, and rebase are all disabled).",
  };
}

export function mergeMethodFlag(
  allowed: readonly MergeMethod[] | undefined,
  fallback: MergeMethod,
  configured: MergeMethod | null,
): { flag: string } | { unavailable: string } {
  const decision = chooseMergeMethod({ allowed, configured, fallback });
  if ("unavailable" in decision) return decision;
  return { flag: `--${decision.method}` };
}
