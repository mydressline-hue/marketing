/**
 * Topological Sort – Kahn's Algorithm
 *
 * Computes a valid execution order for workflow steps based on their
 * dependency graph. If the graph contains a cycle, a `ValidationError`
 * is thrown with details about the involved nodes.
 */

import { ValidationError } from '../../utils/errors';

/**
 * Represents a single node in the dependency graph.
 *
 * @property id        - Unique identifier of the step.
 * @property dependsOn - Array of step IDs this step depends on.
 */
export interface GraphNode {
  id: string;
  dependsOn: string[];
}

/**
 * Performs a topological sort on the provided graph nodes using Kahn's
 * algorithm (BFS-based). Returns an ordered array of node IDs such that
 * every node appears after all of its dependencies.
 *
 * @param nodes - Array of graph nodes with their dependency lists.
 * @returns Ordered array of node IDs in valid execution order.
 * @throws ValidationError if a circular dependency is detected.
 * @throws ValidationError if a dependency references a non-existent node.
 */
export function topologicalSort(nodes: GraphNode[]): string[] {
  // Build a set of all known node IDs for validation
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Validate that all dependencies reference existing nodes
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodeIds.has(dep)) {
        throw new ValidationError(
          `Step "${node.id}" depends on unknown step "${dep}"`,
        );
      }
    }
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      // dep -> node.id  (dep must complete before node)
      adjacency.get(dep)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
    }
  }

  // Initialize the queue with all nodes that have zero in-degree
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If we haven't visited all nodes, there is a cycle
  if (sorted.length !== nodes.length) {
    const cycleNodes = nodes
      .filter((n) => !sorted.includes(n.id))
      .map((n) => n.id);

    throw new ValidationError(
      `Circular dependency detected among steps: ${cycleNodes.join(', ')}`,
    );
  }

  return sorted;
}
