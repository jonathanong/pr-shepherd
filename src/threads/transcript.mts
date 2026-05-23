import type { ReviewThread, ReviewThreadComment } from "../types.mts";

export function threadComments(thread: {
  body: string;
  author: string;
  authorType?: ReviewThreadComment["authorType"];
  url?: string;
  createdAtUnix?: number;
  comments?: Array<
    Pick<ReviewThreadComment, "id" | "author" | "body" | "url"> & {
      authorType?: ReviewThreadComment["authorType"];
    } & Partial<Pick<ReviewThreadComment, "isMinimized" | "createdAtUnix">>
  >;
}): ReviewThreadComment[] {
  if (thread.comments && thread.comments.length > 0) {
    return thread.comments.map((c) => ({
      id: c.id,
      isMinimized: c.isMinimized ?? false,
      author: c.author,
      authorType: c.authorType ?? "Unknown",
      body: c.body,
      url: c.url,
      createdAtUnix: c.createdAtUnix ?? 0,
    }));
  }
  return [
    {
      id: "",
      isMinimized: false,
      author: thread.author,
      authorType: thread.authorType ?? "Unknown",
      body: thread.body,
      url: thread.url ?? "",
      createdAtUnix: thread.createdAtUnix ?? 0,
    },
  ];
}

const THREAD_COMMENT_SEPARATOR = "\n\n--- thread comment ---\n\n";

export function threadTranscriptBody(thread: ReviewThread, appendedBodies: string[] = []): string {
  const bodies =
    thread.comments && thread.comments.length > 0
      ? threadComments(thread).map((c) => c.body)
      : [thread.body];
  return [...bodies, ...appendedBodies].join(THREAD_COMMENT_SEPARATOR);
}
