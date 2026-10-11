import { readAllowedMergeMethods } from "../config/merge-method.mts";

interface RepositoryHandoffFields {
  viewerPermission?: string | null;
  mergeCommitAllowed?: boolean;
  squashMergeAllowed?: boolean;
  rebaseMergeAllowed?: boolean;
}

/** What a routed-layer handoff needs from a stack read besides the layers themselves. */
export interface StackHandoffContext {
  /** Stack identity and each ordered layer's entry position. */
  stack?: { id: string; positions: number[] };
  viewerPermission?: string | null;
  mergeSettings?: Omit<RepositoryHandoffFields, "viewerPermission">;
}

export function stackHandoffContext(
  repository: RepositoryHandoffFields,
  id: string,
  entries: Array<{ position: number; pullRequest: { number: number } }>,
  ordered: Array<{ number: number }>,
): StackHandoffContext {
  const position = new Map(entries.map((entry) => [entry.pullRequest.number, entry.position]));
  const { viewerPermission, mergeCommitAllowed, squashMergeAllowed, rebaseMergeAllowed } =
    repository;
  return {
    stack: { id, positions: ordered.map((pr) => position.get(pr.number)!) },
    ...(viewerPermission !== undefined && { viewerPermission }),
    ...(readAllowedMergeMethods(repository) && {
      mergeSettings: { mergeCommitAllowed, squashMergeAllowed, rebaseMergeAllowed },
    }),
  };
}
