/**
 * SQLite persistence layer for the semantic cache.
 *
 * Uses better-sqlite3 for synchronous access, which is safe in a single-threaded
 * Node.js process.  All writes are committed atomically by the library.
 *
 * The schema uses an `ON CONFLICT ... DO UPDATE` upsert so re-caching the same
 * `(tool_name, canon_key)` pair simply refreshes the stored value and TTL.
 */

import Database from "better-sqlite3";

/** Alias for the better-sqlite3 Database type used throughout this module. */
export type Db = Database.Database;

/** Return the current Unix timestamp as a whole-second integer. */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Create tables and indexes required by the cache, if they do not exist.
 *
 * Safe to call on an already-initialized database — all statements use
 * `CREATE ... IF NOT EXISTS`.
 *
 * @param db - Open better-sqlite3 database handle.
 */
export function initDb(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name   TEXT NOT NULL,
      canon_key   TEXT NOT NULL,
      result      TEXT NOT NULL,
      embedding   TEXT,
      expires_at  INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_key
      ON cache_entries(tool_name, canon_key);
    CREATE TABLE IF NOT EXISTS stats (
      key   TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO stats(key, value) VALUES ('hits', 0);
    INSERT OR IGNORE INTO stats(key, value) VALUES ('misses', 0);
  `);
}

/**
 * Insert or replace a cache entry.
 *
 * If a row already exists for `(toolName, canonKey)` it is updated in-place
 * so the unique index is never violated.
 *
 * @param db - Open database handle.
 * @param toolName - Logical name of the cached tool.
 * @param canonKey - Canonical JSON key produced by {@link canonicalizeArgs}.
 * @param resultStr - JSON-serialized tool result.
 * @param embeddingStr - JSON-serialized float vector, or `null`.
 * @param expiresAt - Unix timestamp after which the entry is invisible, or `null` for no expiry.
 */
export function dbPut(
  db: Db,
  toolName: string,
  canonKey: string,
  resultStr: string,
  embeddingStr: string | null,
  expiresAt: number | null,
): void {
  const now = unixNow();
  db.prepare(`
    INSERT INTO cache_entries
      (tool_name, canon_key, result, embedding, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool_name, canon_key) DO UPDATE SET
      result     = excluded.result,
      embedding  = excluded.embedding,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `).run(toolName, canonKey, resultStr, embeddingStr, expiresAt, now);
}

/**
 * Return the raw result string for an exact key match, or `null` on miss or expiry.
 *
 * Expired entries (where `expires_at <= now`) are treated as absent.
 *
 * @param db - Open database handle.
 * @param toolName - Tool name to scope the lookup.
 * @param canonKey - Canonical key to look up.
 */
export function dbLookupExact(
  db: Db,
  toolName: string,
  canonKey: string,
): string | null {
  const now = unixNow();
  const row = db.prepare(`
    SELECT result FROM cache_entries
    WHERE tool_name = ? AND canon_key = ?
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `).get(toolName, canonKey, now) as { result: string } | undefined;
  return row ? row.result : null;
}

/**
 * Return the number of non-expired entries across all tools.
 *
 * @param db - Open database handle.
 */
export function dbCountActive(db: Db): number {
  const row = db.prepare(
    "SELECT COUNT(*) AS cnt FROM cache_entries WHERE expires_at IS NULL OR expires_at > ?"
  ).get(unixNow()) as { cnt: number };
  return row.cnt;
}

/**
 * Delete cache entries and return the number of rows removed.
 *
 * @param db - Open database handle.
 * @param toolName - If non-null, delete only entries for this tool; otherwise delete all.
 * @returns Number of rows deleted.
 */
export function dbClear(db: Db, toolName: string | null): number {
  if (toolName) {
    const info = db.prepare("DELETE FROM cache_entries WHERE tool_name = ?").run(toolName);
    return info.changes;
  }
  const info = db.prepare("DELETE FROM cache_entries").run();
  return info.changes;
}

/**
 * Return all non-expired rows for `toolName` that have a stored embedding.
 *
 * Used by the similarity-lookup path to load candidates for cosine scoring.
 *
 * @param db - Open database handle.
 * @param toolName - Tool name to scope the query.
 * @returns Array of `{ result, embedding }` objects.
 */
export function dbAllWithEmbeddings(
  db: Db,
  toolName: string,
): Array<{ result: string; embedding: string }> {
  const now = unixNow();
  return db.prepare(`
    SELECT result, embedding FROM cache_entries
    WHERE tool_name = ? AND embedding IS NOT NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).all(toolName, now) as Array<{ result: string; embedding: string }>;
}
