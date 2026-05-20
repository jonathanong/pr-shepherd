export interface CheckAnnotation {
  /** Stable marker id used by Shepherd; prefixed to avoid collisions with comment/review IDs. */
  id: string;
  path: string;
  startLine: number | null;
  endLine: number | null;
  startColumn?: number | null;
  endColumn?: number | null;
  level: string;
  title?: string;
  message: string;
  rawDetails?: string;
  blobUrl?: string;
}
