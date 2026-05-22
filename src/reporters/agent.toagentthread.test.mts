import { describe, it, expect } from "vitest";
import { toAgentThread } from "./agent.mts";
import type { ReviewThread } from "../types.mts";

const thread: ReviewThread = {
  id: "t-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "alice",
  authorType: "User",
  body: "Please fix this method.",
  url: "",
  createdAtUnix: 1700000000,
};

describe("toAgentThread", () => {
  it("keeps id/path/line/author/body and drops isResolved/isOutdated/createdAtUnix", () => {
    const result = toAgentThread(thread);
    expect(result).toEqual({
      id: "t-1",
      path: "src/foo.mts",
      line: 10,
      author: "alice",
      authorType: "User",
      body: "Please fix this method.",
      url: "",
    });
    expect(result).not.toHaveProperty("isResolved");
    expect(result).not.toHaveProperty("isOutdated");
    expect(result).not.toHaveProperty("createdAtUnix");
  });

  it("omits startLine when null (single-line thread)", () => {
    const result = toAgentThread(thread);
    expect(result).not.toHaveProperty("startLine");
  });

  it("omits startLine when equal to line (same-line range)", () => {
    const result = toAgentThread({ ...thread, startLine: 10, line: 10 });
    expect(result).not.toHaveProperty("startLine");
  });

  it("includes startLine when it differs from line (multi-line range)", () => {
    const result = toAgentThread({ ...thread, startLine: 8, line: 10 });
    expect(result.startLine).toBe(8);
  });

  it("attaches parsed suggestion when body contains a ```suggestion fence", () => {
    const body = "```suggestion\nconst x = 1;\n```";
    const result = toAgentThread({
      ...thread,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      body,
    });
    expect(result.suggestion).toEqual({
      startLine: 10,
      endLine: 10,
      lines: ["const x = 1;"],
      author: "alice",
    });
  });

  it("omits suggestion when body has no suggestion fence", () => {
    const result = toAgentThread(thread);
    expect(result).not.toHaveProperty("suggestion");
  });

  it("omits suggestion when path is null (file-level comment)", () => {
    const body = "```suggestion\nconst x = 1;\n```";
    const result = toAgentThread({ ...thread, path: null, body });
    expect(result).not.toHaveProperty("suggestion");
  });

  it("preserves full thread comments when present", () => {
    const result = toAgentThread({
      ...thread,
      comments: [
        {
          id: "c-1",
          isMinimized: false,
          author: "alice",
          authorType: "User",
          body: "first",
          url: "https://example.com/c1",
          createdAtUnix: 1,
        },
        {
          id: "c-2",
          isMinimized: false,
          author: "bob",
          authorType: "Unknown",
          body: "reply",
          url: "https://example.com/c2",
          createdAtUnix: 2,
        },
      ],
    });

    expect(result.comments).toEqual([
      {
        id: "c-1",
        author: "alice",
        authorType: "User",
        body: "first",
        url: "https://example.com/c1",
      },
      {
        id: "c-2",
        author: "bob",
        authorType: "Unknown",
        body: "reply",
        url: "https://example.com/c2",
      },
    ]);
  });
});
