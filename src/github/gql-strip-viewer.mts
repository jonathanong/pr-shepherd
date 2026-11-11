const VIEWER_LOGIN_BLOCK = /^[ \t]*viewer \{\n[ \t]*login\n[ \t]*\}\n/m;
const VIEWER_FIELD_LINE = /^[ \t]*viewer\w+[ \t]*\n/gm;

/**
 * Derive a viewer-free document from a bundled one: drop `viewer { login }` and every
 * `viewerCan*` / `viewerDidAuthor` / `viewerPermission` selection line, and rename the
 * operation. The viewer-free document is what a GitHub App installation may answer
 * (`app-eligibility.mts`); `BatchPrViewer` reads the dropped fields on the user's token.
 */
export function stripViewerFields(document: string, operationName: string): string {
  return document
    .replace(VIEWER_LOGIN_BLOCK, "")
    .replace(VIEWER_FIELD_LINE, "")
    .replace(/^query \w+/m, `query ${operationName}`);
}
