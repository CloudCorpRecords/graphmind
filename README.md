# graphmind

graphmind is a small, durable memory for agents: a knowledge graph you
can build up a fact at a time and query back later. You record
**entities** — people, places, projects, anything with a name — each
with a type and a growing list of plain-text **observations**, and you
connect them with typed **relations** ("Alice — lives_in → Lisbon").
The whole graph lives in one JSON file on disk, so the memory survives
restarts and stays readable, diffable, and editable by hand.

There is no database to run and no service to sign up for. The graph
file is the product.

## Install

```bash
npx @reneturcios/graphmind read
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/graphmind
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead. If you run the container, mount a
volume over the working directory if you want the graph file to persist
between runs.

## Where the graph lives

The store file path comes from the `GRAPHMIND_FILE` environment
variable and defaults to `./graphmind.json` in the current working
directory. The file is loaded when the server (or a CLI command)
starts, and it is rewritten after every change, so what is on disk is
always the full current graph:

```json
{
  "entities": [
    { "name": "Alice", "entityType": "person", "observations": ["Lives in Lisbon"] }
  ],
  "relations": [
    { "from": "Alice", "to": "Lisbon", "relationType": "lives_in" }
  ]
}
```

## CLI

The CLI is a read/inspect face over the same store file the MCP server
writes:

```bash
# Print the whole graph as JSON
graphmind read

# Print the subgraph matching a search term
graphmind search lisbon

# Point at a specific store file
GRAPHMIND_FILE=~/notes/graph.json graphmind read

graphmind --version
```

Exit codes: `0` on success, `1` when the store cannot be read or
written, `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/graphmind mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "graphmind": {
      "command": "npx",
      "args": ["-y", "@reneturcios/graphmind", "mcp"],
      "env": { "GRAPHMIND_FILE": "/path/to/graphmind.json" }
    }
  }
}
```

### Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `create_entities` | `entities`: array of `{name, entityType, observations}` | Adds entities whose names are not already taken. Existing names are skipped and the stored entity is left untouched. Returns only the entities actually created. |
| `create_relations` | `relations`: array of `{from, to, relationType}` | Adds relations whose exact triple is not already present. Returns only the relations actually created. |
| `add_observations` | `observations`: array of `{entityName, contents}` | Appends observation strings to existing entities, skipping strings the entity already has. Returns what was added, per entity. |
| `delete_entities` | `entityNames`: array of strings | Removes the named entities and every relation that touches any of them. |
| `delete_observations` | `deletions`: array of `{entityName, observations}` | Removes the listed observation strings from the named entities. |
| `delete_relations` | `relations`: array of `{from, to, relationType}` | Removes relations matching the given exact triples. |
| `read_graph` | _(none)_ | Returns the entire graph: all entities and all relations. |
| `search_nodes` | `query`: string | Case-insensitive substring search over entity names, types, and observations. Returns the matching entities plus the relations whose endpoints both matched. |
| `open_nodes` | `names`: array of strings | Returns the named entities plus the relations between them. Unknown names are skipped. |

### Behaviour worth knowing

- **Names are identity.** An entity is its name; creating a second
  entity with the same name does nothing. Rename by deleting and
  recreating.
- **Relations need real endpoints.** `create_relations` requires both
  the `from` and `to` entities to already exist, and fails the whole
  call if one is missing — no stub entities are invented, so a typo
  surfaces immediately instead of quietly corrupting the graph.
- **Observations are a set, in order.** Adding a string an entity
  already carries is a no-op; new strings append in the order given.
- **Deletes cascade only from entities.** Deleting an entity removes
  its relations; deleting observations or relations never touches
  anything else.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
