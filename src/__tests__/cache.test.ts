import Database from "better-sqlite3";
import { canonicalizeArgs } from "../canon.js";
import {
  dbAllWithEmbeddings,
  dbClear,
  dbCountActive,
  dbLookupExact,
  dbPut,
  initDb,
  unixNow,
  type Db,
} from "../db.js";
import { cosineSimilarity, findSimilarityMatch } from "../similarity.js";

function makeDb(): Db {
  const db = new Database(":memory:");
  initDb(db);
  return db;
}

function put(db: Db, tool: string, args: unknown, result: unknown): void {
  const key = canonicalizeArgs(args);
  dbPut(db, tool, key, JSON.stringify(result), null, null);
}

function lookup(db: Db, tool: string, args: unknown): unknown {
  const key = canonicalizeArgs(args);
  const raw = dbLookupExact(db, tool, key);
  return raw !== null ? JSON.parse(raw) : null;
}

// --- put then lookup ---

test("put then lookup hits", () => {
  const db = makeDb();
  const args = { file: "src/main.rs", recursive: false };
  const result = { lines: 42 };
  put(db, "read_file", args, result);
  expect(lookup(db, "read_file", args)).toEqual(result);
});

test("path variants collide", () => {
  const db = makeDb();
  put(db, "read_file", { path: "./src/main.rs" }, { ok: true });
  expect(lookup(db, "read_file", { path: "src/main.rs" })).not.toBeNull();
});

test("key order does not matter", () => {
  const db = makeDb();
  put(db, "tool", { z: 9, a: 1 }, "stored");
  expect(lookup(db, "tool", { a: 1, z: 9 })).not.toBeNull();
});

test("lookup miss returns null", () => {
  const db = makeDb();
  expect(lookup(db, "nonexistent_tool", { x: 1 })).toBeNull();
});

test("different tools do not collide", () => {
  const db = makeDb();
  put(db, "tool_a", { id: 1 }, "result_a");
  put(db, "tool_b", { id: 1 }, "result_b");
  expect(lookup(db, "tool_a", { id: 1 })).toBe("result_a");
  expect(lookup(db, "tool_b", { id: 1 })).toBe("result_b");
});

test("ttl expiry causes miss", () => {
  const db = makeDb();
  const key = canonicalizeArgs({ k: "v" });
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run("t", key, '"x"', unixNow() - 10, unixNow() - 20);
  expect(lookup(db, "t", { k: "v" })).toBeNull();
});

test("ttl not yet expired returns result", () => {
  const db = makeDb();
  const key = canonicalizeArgs({ k: "future" });
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run("t", key, '"live"', unixNow() + 3600, unixNow());
  expect(lookup(db, "t", { k: "future" })).toBe("live");
});

test("ttl null never expires", () => {
  const db = makeDb();
  const key = canonicalizeArgs({ k: "permanent" });
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, expires_at, created_at) VALUES (?, ?, ?, NULL, ?)"
  ).run("t", key, '"perm"', unixNow());
  expect(lookup(db, "t", { k: "permanent" })).toBe("perm");
});

test("overwrite updates entry", () => {
  const db = makeDb();
  put(db, "tool", { x: 1 }, "first");
  put(db, "tool", { x: 1 }, "second");
  expect(lookup(db, "tool", { x: 1 })).toBe("second");
});

test("lookup on empty db returns null", () => {
  const db = makeDb();
  expect(dbLookupExact(db, "t", "somekey")).toBeNull();
});

// --- dbCountActive ---

test("count active only counts live entries", () => {
  const db = makeDb();
  put(db, "tool", { x: 1 }, "live");
  const key = canonicalizeArgs({ x: 2 });
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tool", key, '"expired"', unixNow() - 1, unixNow() - 10);
  expect(dbCountActive(db)).toBe(1);
});

// --- cache_clear ---

test("clear all entries", () => {
  const db = makeDb();
  put(db, "tool_a", { x: 1 }, "r");
  put(db, "tool_b", { x: 2 }, "r");
  const deleted = dbClear(db, null);
  expect(deleted).toBe(2);
  expect(dbCountActive(db)).toBe(0);
});

test("clear by tool name", () => {
  const db = makeDb();
  put(db, "tool_a", { x: 1 }, "r");
  put(db, "tool_b", { x: 2 }, "r");
  const deleted = dbClear(db, "tool_a");
  expect(deleted).toBe(1);
  expect(lookup(db, "tool_b", { x: 2 })).not.toBeNull();
});

test("clear empty db returns zero", () => {
  const db = makeDb();
  expect(dbClear(db, null)).toBe(0);
});

test("clear nonexistent tool returns zero", () => {
  const db = makeDb();
  put(db, "tool_a", { x: 1 }, "r");
  expect(dbClear(db, "other")).toBe(0);
  expect(dbCountActive(db)).toBe(1);
});

// --- dbAllWithEmbeddings ---

test("all with embeddings returns only rows with embeddings", () => {
  const db = makeDb();
  const key1 = canonicalizeArgs({ a: 1 });
  const key2 = canonicalizeArgs({ b: 2 });
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, embedding, expires_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  ).run("t", key1, '"r1"', JSON.stringify([1.0, 0.0]), unixNow());
  db.prepare(
    "INSERT INTO cache_entries (tool_name, canon_key, result, embedding, expires_at, created_at) VALUES (?, ?, ?, NULL, NULL, ?)"
  ).run("t", key2, '"r2"', unixNow());
  const rows = dbAllWithEmbeddings(db, "t");
  expect(rows).toHaveLength(1);
  expect(rows[0].result).toBe('"r1"');
});

// --- cosine similarity ---

test("cosine identical vectors", () => {
  const a = [1, 2, 3];
  expect(Math.abs(cosineSimilarity(a, a) - 1.0)).toBeLessThan(1e-6);
});

test("cosine orthogonal vectors", () => {
  expect(Math.abs(cosineSimilarity([1, 0], [0, 1]))).toBeLessThan(1e-6);
});

test("cosine zero vector returns zero", () => {
  expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
});

test("cosine length mismatch returns zero", () => {
  expect(cosineSimilarity([1], [1, 2])).toBe(0);
});

test("cosine empty vectors return zero", () => {
  expect(cosineSimilarity([], [])).toBe(0);
});

test("cosine antiparallel vectors return -1", () => {
  expect(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1.0)).toBeLessThan(1e-6);
});

// --- findSimilarityMatch ---

test("find similarity match hits above threshold", () => {
  const rows = [{ result: '"hit"', embedding: JSON.stringify([1.0, 0.0]) }];
  expect(findSimilarityMatch(rows, [1.0, 0.0], 0.95)).toBe('"hit"');
});

test("find similarity match misses below threshold", () => {
  const rows = [{ result: '"miss"', embedding: JSON.stringify([1.0, 0.0]) }];
  expect(findSimilarityMatch(rows, [0.0, 1.0], 0.95)).toBeNull();
});

test("find similarity match selects best candidate", () => {
  const rows = [
    { result: '"worse"', embedding: JSON.stringify([1.0, 0.5, 0.0]) },
    { result: '"better"', embedding: JSON.stringify([1.0, 0.9, 0.0]) },
  ];
  expect(findSimilarityMatch(rows, [1.0, 0.9, 0.0], 0.0)).toBe('"better"');
});

test("find similarity match skips invalid embedding", () => {
  const rows = [
    { result: '"ok"', embedding: JSON.stringify([1.0, 0.0]) },
    { result: '"bad"', embedding: "not-json" },
  ];
  expect(findSimilarityMatch(rows, [1.0, 0.0], 0.95)).toBe('"ok"');
});

test("find similarity match on empty rows returns null", () => {
  expect(findSimilarityMatch([], [1.0, 0.0], 0.5)).toBeNull();
});
