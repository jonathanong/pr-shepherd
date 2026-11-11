export interface SseMessage {
  id?: string;
  event: string;
  data: string;
}

/**
 * Incremental Server-Sent Events parser. Feed it decoded chunks; it returns each completed
 * message. Comment lines (`: ping` keepalives) and unknown fields are dropped.
 */
export function createSseParser(): (chunk: string) => SseMessage[] {
  let buffer = "";
  let id: string | undefined;
  let event = "message";
  let data: string[] = [];
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r\n|\n|\r/);
    buffer = lines.pop()!;
    const messages: SseMessage[] = [];
    for (const line of lines) {
      if (line === "") {
        if (data.length > 0)
          messages.push({ ...(id !== undefined && { id }), event, data: data.join("\n") });
        event = "message";
        data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "id") id = value;
      else if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    return messages;
  };
}
