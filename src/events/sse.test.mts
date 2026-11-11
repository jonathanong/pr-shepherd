import { describe, expect, it } from "vitest";
import { createSseParser } from "./sse.mts";

describe("createSseParser", () => {
  it("parses id, event and data, and drops comments", () => {
    const parse = createSseParser();
    expect(parse(': connected\n\nid: abc\nevent: envelope\ndata: {"a":1}\n\n')).toEqual([
      { id: "abc", event: "envelope", data: '{"a":1}' },
    ]);
  });

  it("buffers across chunk boundaries and handles CRLF", () => {
    const parse = createSseParser();
    expect(parse("event: gap\r\nda")).toEqual([]);
    expect(parse("ta: one\r\ndata: two\r\n\r\n")).toEqual([{ event: "gap", data: "one\ntwo" }]);
  });

  it("defaults the event name, skips data-less blocks, and ignores unknown fields", () => {
    const parse = createSseParser();
    expect(parse("retry: 5\n\n")).toEqual([]);
    expect(parse("bogus\ndata\n\n")).toEqual([{ event: "message", data: "" }]);
    expect(parse("data:x\n\n")).toEqual([{ event: "message", data: "x" }]);
  });
});
