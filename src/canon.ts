/**
 * Argument canonicalization for the semantic cache.
 *
 * Rules applied so semantically-equivalent inputs always collide:
 * 1. Object keys are sorted recursively.
 * 2. String values that look like relative filesystem paths are normalized
 *    (leading ./ stripped, multiple slashes collapsed, trailing slash removed).
 * 3. Whitespace in string values is collapsed to single spaces and trimmed.
 */

export function canonicalizeArgs(args: unknown): string {
  return JSON.stringify(normalize(args));
}

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

function normalizeString(s: string): string {
  const trimmed = s.trim();
  // Collapse internal whitespace to a single space.
  const collapsed = trimmed.split(/\s+/).filter(Boolean).join(" ");
  if (looksLikePath(collapsed)) {
    return normalizePath(collapsed);
  }
  return collapsed;
}

function looksLikePath(s: string): boolean {
  const hasSlash =
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.includes("/");
  const isUrl = s.includes("://");
  return hasSlash && !isUrl;
}

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
