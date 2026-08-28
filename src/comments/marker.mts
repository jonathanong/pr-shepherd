const PR_SHEPHERD_MARKER = "<!-- pr-shepherd -->";

function hasPrShepherdMarker(body: string): boolean {
  return body.startsWith(PR_SHEPHERD_MARKER);
}

export function addPrShepherdMarker(body: string): string {
  return `${PR_SHEPHERD_MARKER}\n${body}`;
}

export function threadEndedByShepherd(thread: {
  body: string;
  comments?: readonly { body: string }[];
}): boolean {
  const comments = thread.comments;
  if (comments && comments.length > 0) {
    return hasPrShepherdMarker(comments[comments.length - 1]!.body);
  }
  return hasPrShepherdMarker(thread.body);
}
