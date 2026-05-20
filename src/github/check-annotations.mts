import { createHash } from "node:crypto";

import { graphql } from "./client.mts";
import { paginateForward } from "./pagination.mts";
import { CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";
import type { CheckAnnotation } from "../types.mts";

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
  const first = await fetchAnnotationPage(checkRunId, null);
  const nodes = [...first.nodes];
  if (first.pageInfo.hasNextPage && first.pageInfo.endCursor) {
    const extra = await paginateForward<RawCheckAnnotation>(
      (cursor) => fetchAnnotationPage(checkRunId, cursor),
      first.pageInfo.endCursor,
    );
    nodes.push(...extra);
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
    message: raw.message,
    ...(rawDetails !== undefined && { rawDetails }),
    ...(blobUrl !== undefined && { blobUrl }),
  };
}

function fallbackId(checkRunId: string, raw: RawCheckAnnotation): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        checkRunId,
        path: raw.path,
        location: raw.location,
        level: raw.annotationLevel,
        title: raw.title,
        message: raw.message,
      }),
    )
    .digest("hex")
    .slice(0, 24);
}
