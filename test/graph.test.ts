import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeGraphStore } from "../src/graph.js";

function memoryStore(): KnowledgeGraphStore {
  return new KnowledgeGraphStore(null);
}

function seed(store: KnowledgeGraphStore): void {
  store.createEntities([
    { name: "Alice", entityType: "person", observations: ["Lives in Lisbon"] },
    { name: "Bob", entityType: "person", observations: ["Works with Alice"] },
    { name: "Lisbon", entityType: "city", observations: ["Capital of Portugal"] },
  ]);
  store.createRelations([
    { from: "Alice", to: "Lisbon", relationType: "lives_in" },
    { from: "Bob", to: "Alice", relationType: "works_with" },
  ]);
}

describe("createEntities", () => {
  it("creates entities and returns them", () => {
    const store = memoryStore();
    const created = store.createEntities([
      { name: "Alice", entityType: "person", observations: ["Lives in Lisbon"] },
    ]);
    assert.deepEqual(created, [
      { name: "Alice", entityType: "person", observations: ["Lives in Lisbon"] },
    ]);
    assert.equal(store.readGraph().entities.length, 1);
  });

  it("skips existing names and returns only newly created entities", () => {
    const store = memoryStore();
    store.createEntities([
      { name: "Alice", entityType: "person", observations: ["first"] },
    ]);
    const created = store.createEntities([
      { name: "Alice", entityType: "robot", observations: ["second"] },
      { name: "Bob", entityType: "person", observations: [] },
    ]);
    assert.deepEqual(created, [{ name: "Bob", entityType: "person", observations: [] }]);
    // The stored Alice is untouched by the skipped re-creation.
    const alice = store.readGraph().entities.find((e) => e.name === "Alice");
    assert.equal(alice?.entityType, "person");
    assert.deepEqual(alice?.observations, ["first"]);
  });

  it("dedupes observations inside a created entity", () => {
    const store = memoryStore();
    const created = store.createEntities([
      { name: "A", entityType: "t", observations: ["x", "x", "y"] },
    ]);
    assert.deepEqual(created[0].observations, ["x", "y"]);
  });
});

describe("createRelations", () => {
  it("creates relations and dedupes exact triples", () => {
    const store = memoryStore();
    seed(store);
    const created = store.createRelations([
      { from: "Alice", to: "Lisbon", relationType: "lives_in" },
      { from: "Alice", to: "Bob", relationType: "knows" },
    ]);
    assert.deepEqual(created, [{ from: "Alice", to: "Bob", relationType: "knows" }]);
    assert.equal(store.readGraph().relations.length, 3);
  });

  it("throws when an endpoint entity does not exist and adds nothing", () => {
    const store = memoryStore();
    seed(store);
    assert.throws(
      () =>
        store.createRelations([
          { from: "Alice", to: "Bob", relationType: "knows" },
          { from: "Alice", to: "Ghost", relationType: "haunts" },
        ]),
      /Entity not found: Ghost/,
    );
    assert.throws(
      () => store.createRelations([{ from: "Ghost", to: "Alice", relationType: "x" }]),
      /Entity not found: Ghost/,
    );
    // The valid relation in the failed batch was not added either.
    assert.equal(store.readGraph().relations.length, 2);
  });
});

describe("addObservations", () => {
  it("adds new observations and reports exactly what was added", () => {
    const store = memoryStore();
    seed(store);
    const result = store.addObservations([
      { entityName: "Alice", contents: ["Speaks Portuguese", "Lives in Lisbon"] },
    ]);
    assert.deepEqual(result, [
      { entityName: "Alice", addedObservations: ["Speaks Portuguese"] },
    ]);
    const alice = store.readGraph().entities.find((e) => e.name === "Alice");
    assert.deepEqual(alice?.observations, ["Lives in Lisbon", "Speaks Portuguese"]);
  });

  it("dedupes repeated contents within one batch item", () => {
    const store = memoryStore();
    seed(store);
    const result = store.addObservations([
      { entityName: "Bob", contents: ["Cyclist", "Cyclist"] },
    ]);
    assert.deepEqual(result[0].addedObservations, ["Cyclist"]);
  });

  it("throws for an unknown entity", () => {
    const store = memoryStore();
    seed(store);
    assert.throws(
      () => store.addObservations([{ entityName: "Ghost", contents: ["boo"] }]),
      /Entity not found: Ghost/,
    );
  });
});

describe("deleteObservations", () => {
  it("removes the listed strings and keeps the rest", () => {
    const store = memoryStore();
    seed(store);
    store.addObservations([{ entityName: "Alice", contents: ["Extra note"] }]);
    const result = store.deleteObservations([
      { entityName: "Alice", observations: ["Lives in Lisbon", "not present"] },
    ]);
    assert.deepEqual(result, [
      { entityName: "Alice", removedObservations: ["Lives in Lisbon"] },
    ]);
    const alice = store.readGraph().entities.find((e) => e.name === "Alice");
    assert.deepEqual(alice?.observations, ["Extra note"]);
  });

  it("throws for an unknown entity", () => {
    const store = memoryStore();
    assert.throws(
      () => store.deleteObservations([{ entityName: "Ghost", observations: [] }]),
      /Entity not found: Ghost/,
    );
  });
});

describe("deleteEntities", () => {
  it("removes the entity and every relation touching it", () => {
    const store = memoryStore();
    seed(store);
    const deleted = store.deleteEntities(["Alice", "Ghost"]);
    assert.deepEqual(deleted, ["Alice"]);
    const graph = store.readGraph();
    assert.deepEqual(
      graph.entities.map((e) => e.name),
      ["Bob", "Lisbon"],
    );
    assert.deepEqual(graph.relations, []);
  });
});

describe("deleteRelations", () => {
  it("removes exact triples and ignores missing ones", () => {
    const store = memoryStore();
    seed(store);
    const removed = store.deleteRelations([
      { from: "Alice", to: "Lisbon", relationType: "lives_in" },
      { from: "Alice", to: "Lisbon", relationType: "visits" },
    ]);
    assert.deepEqual(removed, [{ from: "Alice", to: "Lisbon", relationType: "lives_in" }]);
    assert.deepEqual(store.readGraph().relations, [
      { from: "Bob", to: "Alice", relationType: "works_with" },
    ]);
  });
});

describe("readGraph", () => {
  it("returns the whole graph and hands out copies", () => {
    const store = memoryStore();
    seed(store);
    const graph = store.readGraph();
    assert.equal(graph.entities.length, 3);
    assert.equal(graph.relations.length, 2);
    graph.entities[0].observations.push("mutated by caller");
    assert.ok(
      !store.readGraph().entities[0].observations.includes("mutated by caller"),
    );
  });
});

describe("searchNodes", () => {
  it("matches on name, type, and observation text, case-insensitively", () => {
    const store = memoryStore();
    seed(store);
    assert.deepEqual(
      store.searchNodes("alice").entities.map((e) => e.name),
      ["Alice", "Bob"],
    );
    assert.deepEqual(
      store.searchNodes("PERSON").entities.map((e) => e.name),
      ["Alice", "Bob"],
    );
    assert.deepEqual(
      store.searchNodes("portugal").entities.map((e) => e.name),
      ["Lisbon"],
    );
    assert.deepEqual(store.searchNodes("nothing-matches-this").entities, []);
  });

  it("includes only relations whose both endpoints matched", () => {
    const store = memoryStore();
    seed(store);
    const result = store.searchNodes("alice");
    assert.deepEqual(result.relations, [
      { from: "Bob", to: "Alice", relationType: "works_with" },
    ]);
  });
});

describe("openNodes", () => {
  it("returns the named entities and the relations between them", () => {
    const store = memoryStore();
    seed(store);
    const result = store.openNodes(["Alice", "Lisbon", "Ghost"]);
    assert.deepEqual(
      result.entities.map((e) => e.name),
      ["Alice", "Lisbon"],
    );
    assert.deepEqual(result.relations, [
      { from: "Alice", to: "Lisbon", relationType: "lives_in" },
    ]);
  });
});

describe("persistence", () => {
  it("round-trips through a temp file: a new store sees the saved graph", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphmind-test-"));
    try {
      const file = join(dir, "graph.json");
      const first = new KnowledgeGraphStore(file);
      seed(first);
      first.addObservations([{ entityName: "Bob", contents: ["Cyclist"] }]);

      const onDisk = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(onDisk.entities.length, 3);
      assert.equal(onDisk.relations.length, 2);

      const second = new KnowledgeGraphStore(file);
      assert.deepEqual(second.readGraph(), first.readGraph());

      second.deleteEntities(["Bob"]);
      const third = new KnowledgeGraphStore(file);
      assert.deepEqual(
        third.readGraph().entities.map((e) => e.name),
        ["Alice", "Lisbon"],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a memory-only store writes no file and starts empty each time", () => {
    const a = memoryStore();
    seed(a);
    const b = memoryStore();
    assert.deepEqual(b.readGraph(), { entities: [], relations: [] });
    assert.equal(a.path, null);
  });
});
