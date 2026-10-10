/** Batch fields no REST endpoint supplies; they stay unknown rather than defaulting to false. */
export const REST_BATCH_UNAVAILABLE: ReadonlyArray<{ field: string; reason: string }> = [
  {
    field: "reviewDecision",
    reason: "REST does not expose an aggregate review decision; latest review states are supplied",
  },
  { field: "viewerAuthorization", reason: "REST does not expose viewer capability fields" },
  {
    field: "comments.isMinimized",
    reason: "REST does not expose minimization state or support minimizing comments",
  },
  {
    field: "mergeQueue",
    reason: "REST does not expose queue membership, entry or removal history",
  },
];
