# shack-semantic-cache (TypeScript)

An MCP server that caches tool-call results in a local SQLite database, using argument canonicalization so semantically equivalent inputs collide into the same cache entry.

Speaks JSON-RPC 2.0 over stdio: STDOUT carries only protocol messages; all diagnostic logs go to STDERR.

## MCP tools

| Tool | Description |
|------|-------------|
| `cache_put` | Store a tool result in the cache. Arguments are canonicalized before storage. Accepts optional `ttl_secs`. |
| `cache_lookup` | Look up a cached result by tool name and arguments. Returns `{ "hit": true/false, ... }`. |
| `cache_stats` | Return cache statistics: active entry count, total hits, total misses. |
| `cache_clear` | Delete all cache entries, optionally filtered by tool name. |

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

Flags:

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
