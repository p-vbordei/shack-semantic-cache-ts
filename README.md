# shack-semantic-cache (TypeScript)

An MCP server that caches tool-call results in a local SQLite database, using
argument canonicalization so semantically equivalent inputs always collide into
the same cache entry.

Speaks JSON-RPC 2.0 over stdio: STDOUT carries only protocol messages; all
diagnostic logs go to STDERR.

## What it does

- Stores tool results keyed by `(tool_name, canonical_args)` in a local SQLite file.
- Canonicalizes arguments before keying: object keys are sorted recursively,
  filesystem-path-like strings are normalized (`./src/x` == `src/x`, `a//b` == `a/b`),
  and whitespace is collapsed — so equivalent inputs always collide.
- URL strings (containing `://`) are never path-normalized.
- Optionally computes float embeddings via an external HTTP endpoint and performs
  cosine-similarity lookup when an exact key is not found.
- Supports per-entry TTL expiry; expired entries are invisible to lookups.

## MCP tools

| Tool | Required arguments | Optional arguments | Description |
|------|-------------------|-------------------|-------------|
| `cache_put` | `tool_name` (string), `arguments` (object), `result` (any) | `ttl_secs` (integer) | Store a tool result in the cache. Arguments are canonicalized before storage. |
| `cache_lookup` | `tool_name` (string), `arguments` (object) | — | Look up a cached result. Returns `{ "hit": true/false, "match_type": "exact"/"similarity", "result": ... }`. |
| `cache_stats` | — | — | Return cache statistics: active entry count, total hits, total misses. |
| `cache_clear` | — | `tool_name` (string) | Delete all cache entries, or only entries for the named tool. |

## Usage example

The server reads newline-delimited JSON-RPC 2.0 from stdin and writes responses
to stdout. A minimal interaction storing and retrieving a result:

```json
// Request: store a result
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"cache_put","arguments":{"tool_name":"read_file","arguments":{"path":"src/main.rs"},"result":{"lines":100}}},"id":1}

// Response
{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"stored"}]},"id":1}

// Request: look it up (path variant "./src/main.rs" normalizes to the same key)
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"cache_lookup","arguments":{"tool_name":"read_file","arguments":{"path":"./src/main.rs"}}},"id":2}

// Response — cache hit
{"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"{\"hit\":true,\"match_type\":\"exact\",\"result\":{\"lines\":100}}"}]},"id":2}
```

## Install and build

```sh
npm install
npm run build
```

## Run

```sh
# Minimal — uses shack-cache.db in the current directory
node dist/main.js

# Or via the bin entry
npx shack-semantic-cache

# Explicit database path
node dist/main.js --db /path/to/cache.db

# With optional embedding similarity
node dist/main.js --db /path/to/cache.db \
    --embed-url http://localhost:11434/api/embeddings \
    --embed-model nomic-embed-text \
    --embed-threshold 0.95
```

### CLI flags

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--db` | `SHACK_CACHE_DB` | `shack-cache.db` | Path to the SQLite database file. |
| `--embed-url` | `SHACK_EMBED_URL` | _(absent)_ | HTTP endpoint for embeddings; enables similarity lookup when set. |
| `--embed-model` | `SHACK_EMBED_MODEL` | `nomic-embed-text` | Model name passed to the embeddings endpoint. |
| `--embed-threshold` | — | `0.95` | Cosine similarity threshold for embedding-based lookup. |

## Tests

```sh
npm test
```

Covers canonicalization (key sorting, path normalization, whitespace collapsing,
URL exclusion), TTL expiry (past, future, null), cache put/lookup/clear/count
operations, embedding row filtering, cosine-similarity helpers, and
similarity-match selection including invalid-embedding resilience.
