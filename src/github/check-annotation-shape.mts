import { createHash } from "node:crypto";

import type { CheckAnnotation } from "../types.mts";

const ANNOTATION_TEXT_MAX_CHARS = 4_000;
const TRUNCATED_SUFFIX = "\n[truncated]";

export interface RawCheckAnnotation {
  fullDatabaseId: string | null;
  path: string;
  annotationLevel: string;
  title: string | null;
  message: string;
  rawDetails: string | null;
  blobUrl: string | null;
  location: {
    start: { line: number | null; column: number | null };
    end: { line: number | null; column: number | null };
  } | null;
}

export function toCheckAnnotation(checkRunId: string, raw: RawCheckAnnotation): CheckAnnotation {
  const id = `check_annotation_${raw.fullDatabaseId ?? fallbackId(checkRunId, raw)}`;
  const title = raw.title?.trim() || undefined;
  const rawDetails = raw.rawDetails?.trim() || undefined;
  const blobUrl = raw.blobUrl?.trim() || undefined;
  return {
    id,
    path: raw.path,
    startLine: raw.location?.start.line ?? null,
    endLine: raw.location?.end.line ?? raw.location?.start.line ?? null,
    ...(raw.location?.start.column !== undefined && {
      startColumn: raw.location.start.column,
    }),
    ...(raw.location?.end.column !== undefined && {
      endColumn: raw.location.end.column,
    }),
    level: raw.annotationLevel,
    ...(title !== undefined && { title }),
    message: truncateAnnotationText(raw.message),
    ...(rawDetails !== undefined && { rawDetails: truncateAnnotationText(rawDetails) }),
    ...(blobUrl !== undefined && { blobUrl }),
  };
}

function truncateAnnotationText(text: string): string {
  if (text.length <= ANNOTATION_TEXT_MAX_CHARS) return text;
  return `${text.slice(0, ANNOTATION_TEXT_MAX_CHARS - TRUNCATED_SUFFIX.length).trimEnd()}${TRUNCATED_SUFFIX}`;
}

function fallbackId(checkRunId: string, raw: RawCheckAnnotation): string {
  const start = raw.location?.start;
  const end = raw.location?.end;
  const parts = [
    checkRunId,
    raw.path,
    raw.annotationLevel,
    raw.title ?? "",
    raw.message,
    raw.rawDetails ?? "",
    raw.blobUrl ?? "",
    String(start?.line ?? ""),
    String(start?.column ?? ""),
    String(end?.line ?? ""),
    String(end?.column ?? ""),
  ];
  const input = parts.map((part) => `${part.length}:${part}`).join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}
