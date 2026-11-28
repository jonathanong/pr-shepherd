import type { PrComment, Review, ReviewThread, ReviewThreadComment } from "../types.mts";
import type { ClassifyItem } from "./types.mts";

export function threadToItem(t: ReviewThread): ClassifyItem {
  return {
    kind: "review-thread",
    id: t.id,
    author: t.author,
    authorType: t.authorType,
    ...(t.authorAssociation !== undefined && { authorAssociation: t.authorAssociation }),
    body: t.body,
    url: t.url,
    path: t.path,
  };
}

export function threadReplyToItem(t: ReviewThread, reply: ReviewThreadComment): ClassifyItem {
  return {
    kind: "review-thread-reply",
    id: reply.id,
    threadId: t.id,
    author: reply.author,
    authorType: reply.authorType,
    ...(reply.authorAssociation !== undefined && { authorAssociation: reply.authorAssociation }),
    body: reply.body,
    ...(reply.url ? { url: reply.url } : {}),
    path: t.path,
  };
}

export function commentToItem(c: PrComment): ClassifyItem {
  return {
    kind: "pr-comment",
    id: c.id,
    author: c.author,
    authorType: c.authorType,
    ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
    body: c.body,
    url: c.url,
  };
}

export function reviewSummaryToItem(r: Review): ClassifyItem {
  return {
    kind: "review-summary",
    id: r.id,
    author: r.author,
    authorType: r.authorType,
    ...(r.authorAssociation !== undefined && { authorAssociation: r.authorAssociation }),
    body: r.body,
    ...(r.url ? { url: r.url } : {}),
  };
}

export function changesRequestedToItem(r: Review): ClassifyItem {
  return {
    kind: "changes-requested",
    id: r.id,
    author: r.author,
    authorType: r.authorType,
    ...(r.authorAssociation !== undefined && { authorAssociation: r.authorAssociation }),
    body: r.body,
  };
}
