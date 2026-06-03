export type ClassifyItemKind =
  | "review-thread"
  | "pr-comment"
  | "review-summary"
  | "changes-requested";

export interface ClassifyItemBase {
  readonly kind: ClassifyItemKind;
  readonly id: string;
  readonly author: string;
  readonly authorType: "User" | "Bot" | "Unknown";
  readonly body: string;
  readonly url?: string;
}

export interface ClassifyReviewThread extends ClassifyItemBase {
  readonly kind: "review-thread";
  readonly path?: string | null;
}

export interface ClassifyPrComment extends ClassifyItemBase {
  readonly kind: "pr-comment";
}

export interface ClassifyReviewSummary extends ClassifyItemBase {
  readonly kind: "review-summary";
}

export interface ClassifyChangesRequested extends ClassifyItemBase {
  readonly kind: "changes-requested";
}

export type ClassifyItem =
  | ClassifyReviewThread
  | ClassifyPrComment
  | ClassifyReviewSummary
  | ClassifyChangesRequested;

export interface ClassifyAction {
  /** When true, routes the item's ID to the appropriate resolve/minimize GitHub mutation. Not supported for changes-requested reviews. */
  readonly autoResolve?: boolean;
  /** When true, hides the item from agent output (seen marker is still written). */
  readonly suppress?: boolean;
  /** Optional note recorded to the debug log when this rule fires. */
  readonly reason?: string;
}

export type ClassifyRule = (item: ClassifyItem) => ClassifyAction | null | undefined;
