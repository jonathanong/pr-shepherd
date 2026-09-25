import { graphql } from "./client.mts";
import { toCheckAnnotation, type RawCheckAnnotation } from "./check-annotation-shape.mts";
import { CHECK_RUN_ANNOTATIONS_QUERY } from "./queries.mts";
import type { CheckAnnotation } from "../types.mts";

const ANNOTATIONS_PER_PAGE = 100;
const MAX_ANNOTATION_PAGES = 10;

export interface AnnotationPage {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: RawCheckAnnotation[];
}

interface RawCheckRunAnnotationsResponse {
  node: {
    __typename: string;
    annotations?: AnnotationPage;
  } | null;
}

/** Pages a single check run. `firstPage` skips the initial `node(id:)` request. */
export async function collectAnnotations(
  checkRunId: string,
  firstPage?: AnnotationPage,
): Promise<CheckAnnotation[]> {
  const nodes: RawCheckAnnotation[] = [];
  let cursor: string | null = null;
  let seeded: AnnotationPage | undefined = firstPage;
  for (let pageNumber = 1; pageNumber <= MAX_ANNOTATION_PAGES; pageNumber++) {
    // eslint-disable-next-line no-await-in-loop
    const current: AnnotationPage = seeded ?? (await fetchAnnotationPage(checkRunId, cursor));
    seeded = undefined;
    nodes.push(...current.nodes);
    if (!current.pageInfo.hasNextPage || !current.pageInfo.endCursor) break;
    if (pageNumber === MAX_ANNOTATION_PAGES) {
      process.stderr.write(
        `pr-shepherd: annotation pagination cap (${MAX_ANNOTATION_PAGES * ANNOTATIONS_PER_PAGE} annotations) reached for check run ${checkRunId} — annotation output may be incomplete\n`,
      );
      break;
    }
    cursor = current.pageInfo.endCursor;
  }
  return nodes.map((node) => toCheckAnnotation(checkRunId, node));
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
