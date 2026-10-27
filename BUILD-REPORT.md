# graphmind — Build Report

Wave 1, Batch 2, MCP Rebuild 100. Clean-room rebuild of the "memory"
MCP server (@modelcontextprotocol/server-memory), built from the
public tool spec in `harness/fixtures/memory-tools-original.json` only.
Local build only — nothing pushed or published.

Identity: repo `graphmind`, npm `@reneturcios/graphmind`,
MCP name `io.github.CloudCorpRecords/graphmind`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `graphmind: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Persistent knowledge graph: entities,
  relations, and observations for agents." = **77 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/graphmind:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT `node /app/dist/cli.js`,
  CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/graphmind"`
- `tsconfig.json` (byte-identical to clockport's/shipcheck's, 318 bytes),
  `.gitignore`, `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios),
  `README.md` (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`mcp`, `read`, `search <query>`,
  `--version`; exit 2 usage / 1 store error), `src/mcp.ts`,
  `src/types.ts`, `src/graph.ts` (core logic, `VERSION = "0.1.0"`)
- `test/graph.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (adapted from clockport's; image name and smoke-test server name changed)

## Implementation notes

- **Storage:** one `KnowledgeGraphStore` class keeps the whole graph in
  memory and mirrors it to a JSON file. The path comes from the
  `GRAPHMIND_FILE` environment variable, defaulting to
  `./graphmind.json` in the working directory. The file is loaded on
  construction when it exists and rewritten after every mutation that
  changes the graph. The constructor also accepts an explicit path, or
  `null` for a memory-only store (what the unit tests use).
- **Entities** are unique by name: `create_entities` skips an existing
  name (stored type/observations untouched) and returns only the
  entities actually created. Observations are deduplicated on create
  and on `add_observations`.
- **Relation endpoint choice (the spec leaves this open):**
  `create_relations` **requires both endpoint entities to already
  exist**. A missing endpoint throws `Entity not found: <name>` and the
  whole batch is validated before anything is added, so a failed call
  changes nothing. No stub entities are invented. Relations are unique
  by their exact (from, to, relationType) triple; re-creating one is a
  no-op and it is not returned again.
- **Adds/deletes:** `add_observations` throws for an unknown entity and
  returns, per entity, exactly the strings that were added.
  `delete_entities` also removes every relation touching a deleted
  entity. `delete_observations` removes the listed strings (unknown
  entity throws; missing strings ignored). `delete_relations` removes
  exact triples only.
- **Reads:** `read_graph` returns copies of all entities and relations.
  `search_nodes` is a case-insensitive substring match over name,
  entityType, and observations, returning the matching entities plus
  relations whose **both** endpoints matched. `open_nodes` returns the
  named entities (unknown names skipped) plus the relations between
  them.
- **MCP registration (standing wave rule):** `src/mcp.ts` uses the SDK's
  low-level `Server` with explicit `inputSchema` literals exactly as
  spec'd — no per-property descriptions, no extra keys — because the
  `McpServer` + zod path injects `$schema` / `additionalProperties` and
  caps parity at 50%. Zod still validates every `tools/call` argument
  set internally.

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced (cli.js, graph.js, mcp.js, index.js, types.js, plus
.d.ts/.js.map).

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 18
ℹ pass 18
ℹ fail 0
```
Covers: create entities + dedupe-by-name skip semantics, observation
dedupe on create, create relations + triple dedupe, unknown-endpoint
error with no partial adds, add_observations (added-only reporting,
in-batch dedupe, unknown entity error), delete_observations,
delete_entities cascading to relations, delete_relations, read_graph
returning copies, search_nodes matching on name/type/observation with
both-endpoint relation filtering, open_nodes subgraph, and a
persistence roundtrip through a temp file (a fresh store on the same
path sees prior mutations, including deletes).

### 3. MCP + CLI smoke
initialize -> `serverInfo: {"name":"graphmind","version":"0.1.0"}`;
tools/list -> exactly the nine spec tools with spec-identical schemas;
tools/call `create_entities` (Alice/person) then `read_graph` returned
the created entity, with the store written to the `GRAPHMIND_FILE`
path given for the smoke run. CLI checks: `--version` -> `0.1.0`,
`read` and `search <query>` print graph JSON (empty graph on a fresh
store), no-args and unknown command exit 2 with Usage.

**Store-file note:** the MCP server creates/updates its JSON store in
its working directory on the first mutating call (expected behaviour
for a file-backed memory server). The parity run below only lists
tools, so it created no `graphmind.json` in the harness cwd — verified
absent after the run; file creation on mutation was verified in the
smoke run above via an explicit `GRAPHMIND_FILE`.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
Original is tools-file mode, so the harness records
`fixture_results: SKIPPED-TOOLS-FILE-MODE` — expected semantics, not an
error. The fixture
(`harness/fixtures/memory-tools-original.json`, created in this batch)
records its ground-truth basis in its `_source` field: the workspace
audit gives 9 tools for the original (GT 9, counts matched) and notes
the wrapper params are undescribed in the original — hence no
per-property descriptions in the spec schemas.
```
$ python3 parity.py --original fixtures/memory-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/graphmind/dist/cli.js mcp" \
    --out /home/hatch/workspace/mcp-rebuild-100/builds/graphmind/parity-out
verdict=PASS parity_pct=100.0 original_tools=9 rebuild_tools=9 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
`parity-out/parity.json` on disk: `identical_tools: 9`,
`matched_tools: 9`, `parity_pct: 100.0`, `verdict: "PASS"`.

## Lockfile status

`package-lock.json` was copied from shipcheck's and edited with the
file edit tool: top-level `name`, root package `name`, and root package
`bin` key changed shipcheck -> graphmind (dependencies are identical
ranges, so the tree is unchanged). Copied from shipcheck with identity
fields edited; **clean lockfile regeneration (no `node_modules`
present) is required before publish** — fleet lesson 2026-10-25; do not
publish from this lockfile as-is. `node_modules` in this build dir is
a `cp -a` copy of shipcheck's (local build only, gitignored).

## Blockers / honest gaps

None for the local build. Notes for the publish wave:
- Regenerate `package-lock.json` clean before first publish (above).
- Container build not exercised locally (no Docker run in this wave);
  the publish-container workflow smoke-tests the image at publish time.
- Live original-vs-rebuild parity was not run: the original server
  cannot launch in this VM (documented in SCOREBOARD.md); parity is
  against the audited tools-file ground truth, as for all Wave 1 builds.
- mcpaudit / mcpvet / shipcheck validation belongs to the pre-publish
  gate and has not been run on this build yet.

## Publish-gate remediation (2026-10-27)

Recorded under Rene's 2026-10-27 decision ("Remediate the 6: add param
descriptions + capability-class vet policy, then re-gate") and
`publish/GATE-POLICY.md`. This is an authorized deviation from the
parity-faithful state: descriptions were added to every tool parameter
that lacked one, in the `src/mcp.ts` schema literals only — parameter
names, types, required lists and enums are unchanged. (The shared
ENTITY_SCHEMA / RELATION_SCHEMA consts were described once each; they
serve 21 parameter occurrences across the 9 tools.)

- Descriptions added: 18 insertion points covering all 21 served
  parameter occurrences.
- Rebuild: `npm run build` (tsc) exit 0; `tsc --noEmit` exit 0; full
  test suite 18/18 pass.
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 55.6** — all
  21 schema diffs are description additions (0 structural). Structural
  parity proven independently: stripping `description` keys from the
  post-remediation tools/list deep-equals the pre-remediation
  tools/list. Adjudication: the description-only diffs are the
  authorized remediation itself; structural parity is unchanged.
  Full record: `publish/parity-remediation/graphmind/parity.json`.
- Re-gate: mcpaudit **PASS 100/100 grade A** (raw:
  `publish/regate/graphmind-mcpaudit.json`); mcpvet raw **REVIEW,
  risk 25** (raw: `publish/regate/graphmind-mcpvet.json`), findings
  adjudicated under GATE-POLICY.md — see PUBLISH-WAVES.md.
