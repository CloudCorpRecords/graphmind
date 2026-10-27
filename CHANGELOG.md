# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- MCP server (`graphmind mcp`, stdio) with nine tools: `create_entities`,
  `create_relations`, `add_observations`, `delete_entities`,
  `delete_observations`, `delete_relations`, `read_graph`,
  `search_nodes`, and `open_nodes`.
- CLI: `graphmind read` prints the whole graph as JSON and
  `graphmind search <query>` prints the matching subgraph.
- The graph lives in a plain JSON file (path from the `GRAPHMIND_FILE`
  environment variable, `./graphmind.json` by default), is loaded when
  the store opens, and is rewritten after every mutation.
- Entities are unique by name and relations by their exact
  (from, to, relationType) triple; creating a relation requires both
  endpoint entities to already exist.
