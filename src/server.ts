/**
 * JSON-RPC 2.0 request handler for the shack-semantic-cache MCP server.
 */

import { canonicalizeArgs } from "./canon.js";
import {
  dbAllWithEmbeddings,
  dbClear,
  dbCountActive,
  dbLookupExact,
  dbPut,
  unixNow,
  type Db,
} from "./db.js";
import { fetchEmbedding, findSimilarityMatch } from "./similarity.js";
import { TOOLS } from "./tools.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "shack-semantic-cache";
const SERVER_VERSION = "0.1.0";

export interface ServerConfig {
  embedUrl?: string;
  embedModel: string;
  embedThreshold: number;
}

export interface ServerState {
  db: Db;
  config: ServerConfig;
  hits: number;
  misses: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

interface JsonRpcRequest {
  jsonrpc: string;
  id?: JsonValue;
  method: string;
  params?: JsonValue;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonValue;
  result?: JsonValue;
  error?: { code: number; message: string };
}

function ok(id: JsonValue, result: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonValue, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textContent(text: string): JsonValue {
  return { content: [{ type: "text", text }] };
}

export async function handleRequest(
  req: JsonRpcRequest,
  state: ServerState,
): Promise<JsonRpcResponse | null> {
  const id: JsonValue = req.id !== undefined ? req.id : null;

  switch (req.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const params = req.params as Record<string, JsonValue> | null;
      const name = params?.name;
      if (typeof name !== "string") {
        return err(id, -32602, "Invalid Params: missing tool name");
      }
      const toolArgs = (params?.arguments ?? {}) as Record<string, JsonValue>;
      try {
        const result = await callTool(name, toolArgs, state);
        return ok(id, result);
      } catch (e) {
        return err(id, -32603, String(e));
      }
    }

    default:
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}

async function callTool(
  name: string,
  args: Record<string, JsonValue>,
  state: ServerState,
): Promise<JsonValue> {
  const { db, config } = state;

  if (name === "cache_put") {
    const toolName = requireString(args, "tool_name");
    const arguments_ = require_(args, "arguments");
    const result = require_(args, "result");
    const ttlSecs = typeof args["ttl_secs"] === "number" ? args["ttl_secs"] : null;

    const canonKey = canonicalizeArgs(arguments_);
    const resultStr = JSON.stringify(result);
    const expiresAt = ttlSecs !== null ? unixNow() + ttlSecs : null;

    let embeddingStr: string | null = null;
    if (config.embedUrl) {
      const emb = await fetchEmbedding(config.embedUrl, config.embedModel, canonKey);
      if (emb !== null) {
        embeddingStr = JSON.stringify(emb);
      }
    }

    dbPut(db, toolName, canonKey, resultStr, embeddingStr, expiresAt);
    return textContent("stored");
  }

  if (name === "cache_lookup") {
    const toolName = requireString(args, "tool_name");
    const arguments_ = require_(args, "arguments");
    const canonKey = canonicalizeArgs(arguments_);

    const exact = dbLookupExact(db, toolName, canonKey);
    if (exact !== null) {
      state.hits++;
      const resultVal = JSON.parse(exact) as JsonValue;
      return textContent(JSON.stringify({ hit: true, match_type: "exact", result: resultVal }));
    }

    if (config.embedUrl) {
      const queryEmb = await fetchEmbedding(config.embedUrl, config.embedModel, canonKey);
      if (queryEmb !== null) {
        const rows = dbAllWithEmbeddings(db, toolName);
        const match = findSimilarityMatch(rows, queryEmb, config.embedThreshold);
        if (match !== null) {
          state.hits++;
          const resultVal = JSON.parse(match) as JsonValue;
          return textContent(
            JSON.stringify({ hit: true, match_type: "similarity", result: resultVal })
          );
        }
      }
    }

    state.misses++;
    return textContent(JSON.stringify({ hit: false }));
  }

  if (name === "cache_stats") {
    const count = dbCountActive(db);
    return textContent(
      JSON.stringify({ entries: count, hits: state.hits, misses: state.misses })
    );
  }

  if (name === "cache_clear") {
    const toolName =
      typeof args["tool_name"] === "string" ? args["tool_name"] : null;
    const deleted = dbClear(db, toolName);
    return textContent(JSON.stringify({ deleted }));
  }

  throw new Error(`Unknown tool: ${name}`);
}

function require_(args: Record<string, JsonValue>, key: string): JsonValue {
  if (!(key in args)) {
    throw new Error(`Missing parameter: ${key}`);
  }
  return args[key];
}

function requireString(args: Record<string, JsonValue>, key: string): string {
  const val = require_(args, key);
  if (typeof val !== "string") {
    throw new Error(`Parameter ${key} must be a string`);
  }
  return val;
}
