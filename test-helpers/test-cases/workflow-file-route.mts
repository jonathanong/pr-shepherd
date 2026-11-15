/** REST `contents` answer for a fixture's `workflowFiles`: a base64 file body, or 404. */
export function workflowFileRoute(
  method: string,
  path: string,
  prefix: string,
  files: Record<string, string> | undefined,
): Response | undefined {
  if (method !== "GET" || !path.startsWith(`${prefix}/contents/`)) return undefined;
  const text = files?.[decodeURIComponent(path.slice(`${prefix}/contents/`.length))];
  const content = Buffer.from(text ?? "").toString("base64");
  const body = text === undefined ? { message: "Not Found" } : { encoding: "base64", content };
  return new Response(JSON.stringify(body), {
    status: text === undefined ? 404 : 200,
    headers: { "content-type": "application/json" },
  });
}
