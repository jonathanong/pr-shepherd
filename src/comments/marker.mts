const PR_SHEPHERD_MARKER = "<!-- pr-shepherd -->";

export function hasPrShepherdMarker(body: string): boolean {
  return body.includes(PR_SHEPHERD_MARKER);
}

export function addPrShepherdMarker(body: string): string {
  return `${PR_SHEPHERD_MARKER}\n${body}`;
}
