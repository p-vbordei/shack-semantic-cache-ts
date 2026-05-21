/**
 * SQLite persistence layer for the semantic cache.
 * Uses better-sqlite3 for synchronous access (safe in single-threaded Node).
 */

import Database from "better-sqlite3";

export type Db = Database.Database;

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

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

export function dbCountActive(db: Db): number {
  const row = db.prepare(
    "SELECT COUNT(*) AS cnt FROM cache_entries WHERE expires_at IS NULL OR expires_at > ?"
  ).get(unixNow()) as { cnt: number };
  return row.cnt;
}

export function dbClear(db: Db, toolName: string | null): number {
  if (toolName) {
    const info = db.prepare("DELETE FROM cache_entries WHERE tool_name = ?").run(toolName);
    return info.changes;
  }
  const info = db.prepare("DELETE FROM cache_entries").run();
  return info.changes;
}

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
