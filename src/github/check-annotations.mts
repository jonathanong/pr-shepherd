import { createHash } from "node:crypto";

import { graphql } from "./client.mts";
import { CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";
import type { CheckAnnotation } from "../types.mts";

const ANNOTATIONS_PER_PAGE = 100;
const MAX_ANNOTATION_PAGES = 10;
const ANNOTATION_TEXT_MAX_CHARS = 4_000;
const TRUNCATED_SUFFIX = "\n[truncated]";

interface RawCheckRunAnnotationsResponse {
  node: {
    __typename: string;
    annotations?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: RawCheckAnnotation[];
    };
  } | null;
}

interface RawCheckAnnotation {
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

export async function fetchCheckRunAnnotations(checkRunId: string): Promise<CheckAnnotation[]> {
  let cursor: string | null = null;
  const nodes: RawCheckAnnotation[] = [];
  for (let page = 1; page <= MAX_ANNOTATION_PAGES; page++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchAnnotationPage(checkRunId, cursor);
    nodes.push(...result.nodes);
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    if (page === MAX_ANNOTATION_PAGES) {
      process.stderr.write(
        `pr-shepherd: annotation pagination cap (${MAX_ANNOTATION_PAGES * ANNOTATIONS_PER_PAGE} annotations) reached for check run ${checkRunId} — annotation output may be incomplete\n`,
      );
      break;
    }
    cursor = result.pageInfo.endCursor;
  }
  return nodes.map((node) => toCheckAnnotation(checkRunId, node));
}

async function fetchAnnotationPage(checkRunId: string, cursor: string | null) {
  const res = await graphql<RawCheckRunAnnotationsResponse>(CHECK_RUN_ANNOTATIONS_QUERY, {
    id: checkRunId,
    ...(cursor ? { cursor } : {}),
  });
  const node = res.data.node;
  if (node?.__typename !== "CheckRun" || node.annotations === undefined) {
    return { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
  }
  return node.annotations;
}

function toCheckAnnotation(checkRunId: string, raw: RawCheckAnnotation): CheckAnnotation {
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
