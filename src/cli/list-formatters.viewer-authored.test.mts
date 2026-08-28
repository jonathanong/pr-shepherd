import { describe, expect, it } from "vitest";
import { renderAuthor, renderThreadBullet } from "./list-formatters.mts";

describe("viewer-authored formatting", () => {
  it("renders the viewer-authored marker alongside author metadata", () => {
    expect(renderAuthor("alice", "User", "MEMBER", true)).toBe(
      "@alice · User · MEMBER · viewer-authored",
    );
  });

  it("renders viewer-authored markers on thread and transcript entries", () => {
    const output = renderThreadBullet({
      id: "t-viewer",
      path: "src/foo.ts",
      line: 1,
      startLine: null,
      author: "alice",
      authorType: "User",
      viewerDidAuthor: true,
      body: "Please fix this.",
      comments: [
        {
          id: "c-viewer",
          author: "alice",
          authorType: "User",
          viewerDidAuthor: true,
          body: "Please fix this.",
          url: "",
        },
      ],
    });

    expect(output).toContain("@alice · User · viewer-authored");
    expect(output).toContain("`commentId=c-viewer`");
  });
});
