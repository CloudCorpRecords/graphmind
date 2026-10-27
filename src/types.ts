/**
 * graphmind types.
 *
 * The graph is deliberately small in shape: a named entity has a type
 * and a list of free-text observations, and a relation is a directed,
 * typed link between two entity names. Everything else in the tool is
 * operations over those two shapes and the graph they form together.
 */

export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

/** One batch item for add_observations: new strings for a named entity. */
export interface ObservationAddition {
  entityName: string;
  contents: string[];
}

/** One batch item for delete_observations: strings to remove from a named entity. */
export interface ObservationDeletion {
  entityName: string;
  observations: string[];
}

/** Per-entity outcome of an add_observations call. */
export interface AddedObservations {
  entityName: string;
  addedObservations: string[];
}
