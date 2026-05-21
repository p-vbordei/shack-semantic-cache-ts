/**
 * MCP tool definitions and handler for shack-semantic-cache.
 */

export const TOOLS = [
  {
    name: "cache_put",
    description:
      "Store a tool result in the cache. Arguments are canonicalized before storage.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: {
          type: "string",
          description: "Name of the tool whose result is being cached.",
        },
        arguments: {
          type: "object",
          description: "Arguments passed to the tool.",
        },
        result: {
          description: "The result value to store (any JSON type).",
        },
        ttl_secs: {
          type: "integer",
          description:
            "Optional time-to-live in seconds. Absent means no expiry.",
        },
      },
      required: ["tool_name", "arguments", "result"],
    },
  },
  {
    name: "cache_lookup",
    description:
      "Look up a cached result by tool name and arguments. Reports hit or miss.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["tool_name", "arguments"],
    },
  },
  {
    name: "cache_stats",
    description: "Return cache statistics: total entries, hits, misses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cache_clear",
    description:
      "Delete all cache entries, optionally filtered by tool name.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: {
          type: "string",
          description: "If given, delete only entries for this tool.",
        },
      },
      required: [],
    },
  },
];
