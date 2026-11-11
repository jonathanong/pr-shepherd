export interface SseMessage {
  id?: string;
  event: string;
  data: string;
}

/** Longest line or frame accepted; a larger one throws so the wait degrades to plain polling. */
const MAX_SSE_BYTES = 1024 * 1024;

/**
 * Incremental Server-Sent Events parser. Feed it decoded chunks; it returns each completed
 * message. Comment lines (`: ping` keepalives) and unknown fields are dropped.
 */
export function createSseParser(): (chunk: string) => SseMessage[] {
  let buffer = "";
  let id: string | undefined;
  let event = "message";
  let data: string[] = [];
  let dataLength = 0;
  return (chunk) => {
    buffer += chunk;
    // A trailing "\r" may be the first half of "\r\n"; keep it until the next chunk decides.
    const heldCr = buffer.endsWith("\r");
    const lines = (heldCr ? buffer.slice(0, -1) : buffer).split(/\r\n|\n|\r/);
    const tail = lines.pop()!;
    buffer = heldCr ? `${tail}\r` : tail;
    if (buffer.length > MAX_SSE_BYTES) throw new Error("SSE line exceeds 1 MiB");
    const messages: SseMessage[] = [];
    for (const line of lines) {
      if (line === "") {
        if (data.length > 0)
          messages.push({ ...(id !== undefined && { id }), event, data: data.join("\n") });
        event = "message";
        data = [];
        dataLength = 0;
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "id") id = value;
      else if (field === "event") event = value;
      else if (field === "data") {
        dataLength += value.length + 1;
        if (dataLength > MAX_SSE_BYTES) throw new Error("SSE frame exceeds 1 MiB");
        data.push(value);
      }
    }
    return messages;
  };
}
