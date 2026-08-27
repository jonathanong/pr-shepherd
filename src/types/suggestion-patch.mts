export interface SuggestionPatchResult {
  threadId: string;
  path: string;
  startLine: number;
  endLine: number;
  author: string;
  /** The unified diff generated for this suggestion. */
  patch: string;
  /** The commit subject line supplied by the caller. */
  commitMessage: string;
  /** The optional description plus Co-authored-by trailer. */
  commitBody: string;
  /** Files the agent should stage before committing. */
  filesToStage: string[];
}

export interface BuildSuggestionPatchesResult {
  pr: number;
  repo: string;
  /** Suggestion patches in caller-supplied application order. */
  patches: SuggestionPatchResult[];
  /** Steps for applying and committing every patch, then pushing once. */
  postActionInstructions: string[];
}

/** @deprecated Use BuildSuggestionPatchesResult. */
export interface CommitSuggestionResult extends SuggestionPatchResult {
  pr: number;
  repo: string;
  /** Numbered steps for the deprecated singular workflow. */
  postActionInstructions: string[];
}
