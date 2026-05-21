/**
 * Argument canonicalization for the semantic cache.
 *
 * Rules applied so semantically-equivalent inputs always collide on the same key:
 *
 * 1. Object keys are sorted recursively so `{b:1,a:2}` and `{a:2,b:1}` produce
 *    the same string.
 * 2. String values that look like filesystem paths are lexically normalized:
 *    leading `./` is removed, consecutive slashes are collapsed, and `..`
 *    components are resolved without touching the filesystem.
 * 3. Whitespace in string values is collapsed to a single space and trimmed.
 * 4. URL strings (containing `://`) are never path-normalized.
 */

/**
 * Produce a stable, normalized JSON string key from any JSON-serializable value.
 *
 * The output is deterministic regardless of dict key insertion order or minor
 * path/whitespace variations in string values.
 *
 * @param args - Any JSON-serializable value.
 * @returns A compact JSON string with no unnecessary whitespace.
 */
export function canonicalizeArgs(args: unknown): string {
  return JSON.stringify(normalize(args));
}

/**
 * Recursively normalize a JSON value for stable serialization.
 *
 * Objects have their keys sorted; arrays are left in original order; strings
 * are whitespace-collapsed and path-normalized where applicable.
 */
function normalize(v: unknown): unknown {
  if (v === null || typeof v !== "object") {
    if (typeof v === "string") {
      return normalizeString(v);
    }
    return v;
  }

  if (Array.isArray(v)) {
    return v.map(normalize);
  }

  // Sort object keys for deterministic ordering.
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = normalize(obj[k]);
  }
  return sorted;
}

/** Trim, collapse internal whitespace, and optionally normalize path syntax. */
function normalizeString(s: string): string {
  const trimmed = s.trim();
  // Collapse internal whitespace to a single space.
  const collapsed = trimmed.split(/\s+/).filter(Boolean).join(" ");
  if (looksLikePath(collapsed)) {
    return normalizePath(collapsed);
  }
  return collapsed;
}

/**
 * Return true if *s* looks like a filesystem path rather than a URL or plain string.
 *
 * A string is treated as a path when it contains a slash but does not contain
 * `://` (which would indicate a URL scheme).
 */
function looksLikePath(s: string): boolean {
  const hasSlash =
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.includes("/");
  const isUrl = s.includes("://");
  return hasSlash && !isUrl;
}

/**
 * Lexically normalize a path without touching the filesystem.
 *
 * Resolves `.` and `..` components and collapses consecutive slashes.
 * The result is absolute iff the input was absolute.
 */
function normalizePath(s: string): string {
  const isAbsolute = s.startsWith("/");
  const parts: string[] = [];

  for (const segment of s.split(/\/+/)) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (parts.length > 0) {
        parts.pop();
      } else {
        parts.push("..");
      }
    } else {
      parts.push(segment);
    }
  }

  const result = parts.join("/");
  return isAbsolute ? "/" + result : result;
}
