import { resolveConfig, type PrShepherdConfig } from "../../src/config/resolve.mts";

type Overlay = Record<string, unknown>;

function isPlainObject(value: unknown): value is Overlay {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function merge(base: Overlay, override: Overlay): Overlay {
  const result: Overlay = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = base[key];
    result[key] = isPlainObject(value) && isPlainObject(current) ? merge(current, value) : value;
  }
  return result;
}

/**
 * A fully resolved config built from the real schema: built-in defaults plus each overlay in
 * order (deep-merged, later wins), written in `.pr-shepherdrc.yml` shape. Unknown keys or
 * invalid values throw, so mocks cannot drift from the schema.
 */
export function testConfig(...overlays: Overlay[]): PrShepherdConfig {
  return resolveConfig(overlays.reduce(merge, {}), "test config");
}
