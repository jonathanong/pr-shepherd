import { readFileSync, writeFileSync } from "node:fs";

const path = "coverage/lcov.info";
const input = readFileSync(path, "utf8");
const output = input
  .split("\n")
  .filter(
    (line) =>
      !line.startsWith("BRDA:") && !line.startsWith("BRF:") && !line.startsWith("BRH:"),
  )
  .join("\n");

writeFileSync(path, output);
