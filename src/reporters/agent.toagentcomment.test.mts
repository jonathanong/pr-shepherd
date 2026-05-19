import { describe, it, expect } from "vitest";
import { toAgentComment } from "./agent.mts";
import type { PrComment } from "../types.mts";

const comment: PrComment = {
  id: "c-1",
  isMinimized: false,
  author: "bob",
  authorType: "Bot",
  body: "Consider renaming.",
  url: "",
  createdAtUnix: 1700000001,
};

describe("toAgentComment", () => {
  it("keeps id/author/body and drops isMinimized/createdAtUnix", () => {
    const result = toAgentComment({ ...comment, edited: true });
    expect(result).toEqual({
      id: "c-1",
      author: "bob",
      authorType: "Bot",
      body: "Consider renaming.",
      url: "",
      edited: true,
    });
    expect(result).not.toHaveProperty("isMinimized");
    expect(result).not.toHaveProperty("createdAtUnix");
  });
});
