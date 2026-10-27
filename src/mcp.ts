/**
 * graphmind MCP server. Tools: create_entities, create_relations,
 * add_observations, delete_entities, delete_observations,
 * delete_relations, read_graph, search_nodes, open_nodes.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects two keys that are not
 * in this tool's public spec ("$schema" and "additionalProperties"),
 * which breaks exact tool-list/schema parity with the spec. This file
 * therefore serves tools/list with the spec's exact input schemas,
 * while zod still validates every tools/call argument set. Tool names
 * and parameters are taken from the public spec.
 *
 * The server owns one KnowledgeGraphStore for its lifetime; the store
 * file is resolved from the GRAPHMIND_FILE environment variable,
 * defaulting to ./graphmind.json in the working directory.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { KnowledgeGraphStore, VERSION } from "./graph.js";

const EntityArgs = z.object({
  name: z.string(),
  entityType: z.string(),
  observations: z.array(z.string()),
});

const RelationArgs = z.object({
  from: z.string(),
  to: z.string(),
  relationType: z.string(),
});

const CreateEntitiesArgs = z.object({ entities: z.array(EntityArgs) });
const CreateRelationsArgs = z.object({ relations: z.array(RelationArgs) });
const AddObservationsArgs = z.object({
  observations: z.array(
    z.object({ entityName: z.string(), contents: z.array(z.string()) }),
  ),
});
const DeleteEntitiesArgs = z.object({ entityNames: z.array(z.string()) });
const DeleteObservationsArgs = z.object({
  deletions: z.array(
    z.object({ entityName: z.string(), observations: z.array(z.string()) }),
  ),
});
const DeleteRelationsArgs = z.object({ relations: z.array(RelationArgs) });
const ReadGraphArgs = z.object({});
const SearchNodesArgs = z.object({ query: z.string() });
const OpenNodesArgs = z.object({ names: z.array(z.string()) });

const ENTITY_SCHEMA = {
  type: "object",
  properties: {
    name: { description: "Unique name of the entity.", type: "string" },
    entityType: { description: "Type or category of the entity.", type: "string" },
    observations: { description: "Observation strings recorded about the entity.", type: "array", items: { type: "string" } },
  },
  required: ["name", "entityType", "observations"],
} as const;

const RELATION_SCHEMA = {
  type: "object",
  properties: {
    from: { description: "Name of the entity the relation starts from.", type: "string" },
    to: { description: "Name of the entity the relation points to.", type: "string" },
    relationType: { description: "Type of the relation between the two entities.", type: "string" },
  },
  required: ["from", "to", "relationType"],
} as const;

const TOOLS = [
  {
    name: "create_entities",
    description:
      "Create new entities in the knowledge graph. Entities whose name already exists are skipped; returns the entities that were created.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entities: { description: "Entities to create; entities whose name already exists are skipped.", type: "array", items: ENTITY_SCHEMA },
      },
      required: ["entities"],
    },
  },
  {
    name: "create_relations",
    description:
      "Create relations between existing entities in the knowledge graph. Relations are unique by their exact from, to, and relationType triple; returns the relations that were created.",
    inputSchema: {
      type: "object" as const,
      properties: {
        relations: { description: "Relations to create between existing entities.", type: "array", items: RELATION_SCHEMA },
      },
      required: ["relations"],
    },
  },
  {
    name: "add_observations",
    description:
      "Add observation strings to existing entities in the knowledge graph. Observations already stored for an entity are not added twice; returns what was added per entity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        observations: { description: "Observation additions, grouped by entity.", type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { description: "Name of the entity to add the observations to.", type: "string" },
              contents: { description: "Observation strings to add to the entity.", type: "array", items: { type: "string" } },
            },
            required: ["entityName", "contents"],
          },
        },
      },
      required: ["observations"],
    },
  },
  {
    name: "delete_entities",
    description:
      "Delete entities from the knowledge graph by name, together with every relation that touches them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entityNames: { description: "Names of the entities to delete, together with every relation that touches them.", type: "array", items: { type: "string" } },
      },
      required: ["entityNames"],
    },
  },
  {
    name: "delete_observations",
    description:
      "Delete specific observation strings from entities in the knowledge graph.",
    inputSchema: {
      type: "object" as const,
      properties: {
        deletions: { description: "Observations to delete, grouped by entity.", type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { description: "Name of the entity to delete observations from.", type: "string" },
              observations: { description: "Observation strings to delete from the entity.", type: "array", items: { type: "string" } },
            },
            required: ["entityName", "observations"],
          },
        },
      },
      required: ["deletions"],
    },
  },
  {
    name: "delete_relations",
    description:
      "Delete relations from the knowledge graph by their exact from, to, and relationType triple.",
    inputSchema: {
      type: "object" as const,
      properties: {
        relations: { description: "Relations to delete, each identified by its exact from, to, and relationType triple.", type: "array", items: RELATION_SCHEMA },
      },
      required: ["relations"],
    },
  },
  {
    name: "read_graph",
    description:
      "Read the entire knowledge graph: every entity and every relation.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_nodes",
    description:
      "Search the knowledge graph for entities whose name, type, or observations contain the query text (case-insensitive), together with the relations between them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { description: "Text to search for in entity names, types, and observations; matching is case-insensitive.", type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "open_nodes",
    description:
      "Open specific entities in the knowledge graph by name, together with the relations between them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        names: { description: "Names of the entities to open.", type: "array", items: { type: "string" } },
      },
      required: ["names"],
    },
  },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const store = new KnowledgeGraphStore();

const server = new Server(
  { name: "graphmind", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_entities": {
        const parsed = CreateEntitiesArgs.parse(args ?? {});
        return textResult(store.createEntities(parsed.entities));
      }
      case "create_relations": {
        const parsed = CreateRelationsArgs.parse(args ?? {});
        return textResult(store.createRelations(parsed.relations));
      }
      case "add_observations": {
        const parsed = AddObservationsArgs.parse(args ?? {});
        return textResult(store.addObservations(parsed.observations));
      }
      case "delete_entities": {
        const parsed = DeleteEntitiesArgs.parse(args ?? {});
        return textResult({ deletedEntities: store.deleteEntities(parsed.entityNames) });
      }
      case "delete_observations": {
        const parsed = DeleteObservationsArgs.parse(args ?? {});
        return textResult(store.deleteObservations(parsed.deletions));
      }
      case "delete_relations": {
        const parsed = DeleteRelationsArgs.parse(args ?? {});
        return textResult({ deletedRelations: store.deleteRelations(parsed.relations) });
      }
      case "read_graph": {
        ReadGraphArgs.parse(args ?? {});
        return textResult(store.readGraph());
      }
      case "search_nodes": {
        const parsed = SearchNodesArgs.parse(args ?? {});
        return textResult(store.searchNodes(parsed.query));
      }
      case "open_nodes": {
        const parsed = OpenNodesArgs.parse(args ?? {});
        return textResult(store.openNodes(parsed.names));
      }
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
