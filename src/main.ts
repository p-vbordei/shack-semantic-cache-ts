#!/usr/bin/env node
/**
 * Entry point for shack-semantic-cache MCP server.
 * Reads JSON-RPC 2.0 messages from stdin, writes responses to stdout.
 * All diagnostic output goes to stderr.
 */

import Database from "better-sqlite3";
import * as readline from "readline";
import { initDb } from "./db.js";
import { handleRequest, type ServerState } from "./server.js";

function parseArgs(): {
  db: string;
  embedUrl?: string;
  embedModel: string;
  embedThreshold: number;
} {
  const argv = process.argv.slice(2);
  const result = {
    db: process.env["SHACK_CACHE_DB"] ?? "shack-cache.db",
    embedUrl: process.env["SHACK_EMBED_URL"],
    embedModel: process.env["SHACK_EMBED_MODEL"] ?? "nomic-embed-text",
    embedThreshold: 0.95,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db" && argv[i + 1]) {
      result.db = argv[++i];
    } else if (arg === "--embed-url" && argv[i + 1]) {
      result.embedUrl = argv[++i];
    } else if (arg === "--embed-model" && argv[i + 1]) {
      result.embedModel = argv[++i];
    } else if (arg === "--embed-threshold" && argv[i + 1]) {
      result.embedThreshold = parseFloat(argv[++i]);
    } else if (arg.startsWith("--db=")) {
      result.db = arg.slice(5);
    } else if (arg.startsWith("--embed-url=")) {
      result.embedUrl = arg.slice(12);
    } else if (arg.startsWith("--embed-model=")) {
      result.embedModel = arg.slice(14);
    } else if (arg.startsWith("--embed-threshold=")) {
      result.embedThreshold = parseFloat(arg.slice(18));
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const sqliteDb = new Database(args.db);
  initDb(sqliteDb);

  process.stderr.write(
    `[shack-semantic-cache] started, database: ${args.db}\n`
  );
  if (args.embedUrl) {
    process.stderr.write(
      `[shack-semantic-cache] embedding similarity enabled: model=${args.embedModel}\n`
    );
  }

  const state: ServerState = {
    db: sqliteDb,
    config: {
      embedUrl: args.embedUrl,
      embedModel: args.embedModel,
      embedThreshold: args.embedThreshold,
    },
    hits: 0,
    misses: 0,
  };

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: unknown;
    try {
      req = JSON.parse(trimmed);
    } catch (e) {
      const errResp = {
        jsonrpc: "2.0",
        error: { code: -32700, message: `Parse error: ${e}` },
        id: null,
      };
      process.stdout.write(JSON.stringify(errResp) + "\n");
      continue;
    }

    const response = await handleRequest(
      req as Parameters<typeof handleRequest>[0],
      state
    );
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[shack-semantic-cache] fatal: ${err}\n`);
  process.exit(1);
});
