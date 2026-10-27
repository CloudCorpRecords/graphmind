#!/usr/bin/env node
/**
 * graphmind CLI.
 *
 *   graphmind read
 *   graphmind search <query>
 *   graphmind mcp
 *
 * Exit codes: 0 success, 1 store/lookup error, 2 usage error.
 * The store file comes from the GRAPHMIND_FILE environment variable,
 * defaulting to ./graphmind.json in the current working directory —
 * the same file the MCP server uses.
 */
import { KnowledgeGraphStore, VERSION } from "./graph.js";

function usage(): never {
  console.error(`Usage:
  graphmind read
  graphmind search <query>
  graphmind mcp
  graphmind --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  try {
    if (cmd === "read") {
      if (rest.length > 0) usage();
      const store = new KnowledgeGraphStore();
      console.log(JSON.stringify(store.readGraph(), null, 2));
    } else if (cmd === "search") {
      const query = rest.join(" ");
      if (!query) usage();
      const store = new KnowledgeGraphStore();
      console.log(JSON.stringify(store.searchNodes(query), null, 2));
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
