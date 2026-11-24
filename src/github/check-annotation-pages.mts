import { graphql } from "./client.mts";
import { toCheckAnnotation, type RawCheckAnnotation } from "./check-annotation-shape.mts";
import { CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";
import type { CheckAnnotation } from "../types.mts";

const ANNOTATIONS_PER_PAGE = 100;
const MAX_ANNOTATION_PAGES = 10;

export interface AnnotationPage {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<RawCheckAnnotation | null>;
}

interface RawCheckRunAnnotationsResponse {
  node: {
    __typename: string;
    annotations?: AnnotationPage;
  } | null;
}

/**
 * A fetched page held a null annotation entry. `readable` is every annotation that was read, so a
 * caller can still surface them while treating the run as unread (never cached, READY held).
 */
export class NullAnnotationNodeError extends Error {
  readonly checkRunId: string;
  readonly readable: CheckAnnotation[];
  constructor(checkRunId: string, readable: CheckAnnotation[]) {
    super(`check run ${checkRunId} annotation page contains a null node`);
    this.checkRunId = checkRunId;
    this.readable = readable;
  }
}

/** Pages a single check run. `firstPage` skips the initial `node(id:)` request. */
export async function collectAnnotations(
  checkRunId: string,
  firstPage?: AnnotationPage,
): Promise<CheckAnnotation[]> {
  const nodes: RawCheckAnnotation[] = [];
  let sawNull = false;
  let cursor: string | null = null;
  let seeded: AnnotationPage | undefined = firstPage;
  for (let pageNumber = 1; pageNumber <= MAX_ANNOTATION_PAGES; pageNumber++) {
    // eslint-disable-next-line no-await-in-loop
    const current: AnnotationPage = seeded ?? (await fetchAnnotationPage(checkRunId, cursor));
    seeded = undefined;
    // A null entry is an annotation GitHub has not served yet. Keep reading, then fail with the
    // readable entries so the caller holds READY and rereads next tick (never caches the run).
    for (const node of current.nodes) {
      if (node == null) sawNull = true;
      else nodes.push(node);
    }
    if (!current.pageInfo.hasNextPage || !current.pageInfo.endCursor) break;
    if (pageNumber === MAX_ANNOTATION_PAGES) {
      process.stderr.write(
        `pr-shepherd: annotation pagination cap (${MAX_ANNOTATION_PAGES * ANNOTATIONS_PER_PAGE} annotations) reached for check run ${checkRunId} — annotation output may be incomplete\n`,
      );
      break;
    }
    cursor = current.pageInfo.endCursor;
  }
  const annotations = nodes.map((node) => toCheckAnnotation(checkRunId, node));
  if (sawNull) throw new NullAnnotationNodeError(checkRunId, annotations);
  return annotations;
}

async function fetchAnnotationPage(
  checkRunId: string,
  cursor: string | null,
): Promise<AnnotationPage> {
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
