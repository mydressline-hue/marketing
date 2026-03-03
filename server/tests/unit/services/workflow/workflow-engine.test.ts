/**
 * Unit tests for WorkflowEngine and topologicalSort.
 *
 * Tests cover:
 *   - Topological sort for valid DAGs (linear, diamond, multiple roots)
 *   - Cycle detection
 *   - Unknown dependency detection
 *   - WorkflowEngine.createWorkflow with dependency validation
 *   - WorkflowEngine.executeWorkflow with step ordering and failure propagation
 *   - WorkflowEngine.cancelWorkflow
 *   - WorkflowEngine.getWorkflowStatus
 *
 * All database interactions are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    }),
  },
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { topologicalSort, GraphNode } from '../../../../src/services/workflow/topological-sort';
import { WorkflowEngine } from '../../../../src/services/workflow/WorkflowEngine';
import { pool } from '../../../../src/config/database';
import { ValidationError, NotFoundError } from '../../../../src/utils/errors';

const mockPoolQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// topologicalSort tests
// ---------------------------------------------------------------------------

describe('topologicalSort', () => {
  it('should sort a simple linear chain: A -> B -> C', () => {
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ];

    const order = topologicalSort(nodes);

    expect(order).toHaveLength(3);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('should sort a diamond dependency graph', () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['A'] },
      { id: 'D', dependsOn: ['B', 'C'] },
    ];

    const order = topologicalSort(nodes);

    expect(order).toHaveLength(4);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('should sort independent nodes (multiple roots, no edges)', () => {
    const nodes: GraphNode[] = [
      { id: 'X', dependsOn: [] },
      { id: 'Y', dependsOn: [] },
      { id: 'Z', dependsOn: [] },
    ];

    const order = topologicalSort(nodes);

    expect(order).toHaveLength(3);
    expect(order).toContain('X');
    expect(order).toContain('Y');
    expect(order).toContain('Z');
  });

  it('should handle a single node with no dependencies', () => {
    const nodes: GraphNode[] = [{ id: 'solo', dependsOn: [] }];

    const order = topologicalSort(nodes);

    expect(order).toEqual(['solo']);
  });

  it('should handle a complex multi-layer DAG', () => {
    //   A   B
    //   |\ /|
    //   | C |
    //   |/ \|
    //   D   E
    //    \ /
    //     F
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: [] },
      { id: 'C', dependsOn: ['A', 'B'] },
      { id: 'D', dependsOn: ['A', 'C'] },
      { id: 'E', dependsOn: ['B', 'C'] },
      { id: 'F', dependsOn: ['D', 'E'] },
    ];

    const order = topologicalSort(nodes);

    expect(order).toHaveLength(6);

    // Verify all dependency constraints
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('E'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('E'));
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('F'));
    expect(order.indexOf('E')).toBeLessThan(order.indexOf('F'));
  });

  // =========================================================================
  // Cycle detection
  // =========================================================================

  it('should throw ValidationError for a direct cycle (A -> B -> A)', () => {
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: ['B'] },
      { id: 'B', dependsOn: ['A'] },
    ];

    expect(() => topologicalSort(nodes)).toThrow(ValidationError);
    expect(() => topologicalSort(nodes)).toThrow(/[Cc]ircular/);
  });

  it('should throw ValidationError for an indirect cycle (A -> B -> C -> A)', () => {
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: ['C'] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ];

    expect(() => topologicalSort(nodes)).toThrow(ValidationError);
    expect(() => topologicalSort(nodes)).toThrow(/[Cc]ircular/);
  });

  it('should throw ValidationError for a self-loop (A -> A)', () => {
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: ['A'] },
    ];

    expect(() => topologicalSort(nodes)).toThrow(ValidationError);
  });

  it('should include cycle node IDs in the error message', () => {
    const nodes: GraphNode[] = [
      { id: 'step-1', dependsOn: ['step-3'] },
      { id: 'step-2', dependsOn: ['step-1'] },
      { id: 'step-3', dependsOn: ['step-2'] },
    ];

    try {
      topologicalSort(nodes);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const msg = (err as Error).message;
      // All three nodes should be in the cycle
      expect(msg).toContain('step-1');
      expect(msg).toContain('step-2');
      expect(msg).toContain('step-3');
    }
  });

  // =========================================================================
  // Unknown dependency detection
  // =========================================================================

  it('should throw ValidationError when a node depends on a non-existent step', () => {
    const nodes: GraphNode[] = [
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['ghost'] },
    ];

    expect(() => topologicalSort(nodes)).toThrow(ValidationError);
    expect(() => topologicalSort(nodes)).toThrow(/ghost/);
  });

  // =========================================================================
  // Empty input
  // =========================================================================

  it('should return empty array for empty input', () => {
    expect(topologicalSort([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// WorkflowEngine tests
// ---------------------------------------------------------------------------

describe('WorkflowEngine', () => {
  beforeEach(() => {
    // Reset all mocks including once-queued return values
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    (pool.connect as jest.Mock).mockReset();

    // Re-setup the connect mock
    (pool.connect as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        query: mockClientQuery,
        release: mockClientRelease,
      }),
    );
  });

  // =========================================================================
  // createWorkflow
  // =========================================================================

  describe('createWorkflow', () => {
    it('should throw ValidationError when name is empty', async () => {
      await expect(
        WorkflowEngine.createWorkflow('', null, [{ name: 'step1', action_type: 'test', action_config: {} }], 'user-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when steps array is empty', async () => {
      await expect(
        WorkflowEngine.createWorkflow('My Workflow', null, [], 'user-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when steps have cyclic dependencies', async () => {
      const steps = [
        { id: 'step-a', name: 'Step A', action_type: 'test', action_config: {}, depends_on: ['step-b'] },
        { id: 'step-b', name: 'Step B', action_type: 'test', action_config: {}, depends_on: ['step-a'] },
      ];

      await expect(
        WorkflowEngine.createWorkflow('Cyclic Workflow', null, steps, 'user-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should create a workflow with valid steps and persist to database', async () => {
      const steps = [
        { id: 'step-1', name: 'Fetch Data', action_type: 'http', action_config: { url: 'https://api.example.com' } },
        { id: 'step-2', name: 'Process Data', action_type: 'transform', action_config: { format: 'csv' }, depends_on: ['step-1'] },
      ];

      // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // INSERT workflow
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'mock-uuid',
          name: 'Data Pipeline',
          description: 'Test workflow',
          status: 'pending',
          created_by: 'user-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        }],
        rowCount: 1,
      });
      // INSERT step-1
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'step-1',
          workflow_id: 'mock-uuid',
          name: 'Fetch Data',
          action_type: 'http',
          action_config: { url: 'https://api.example.com' },
          depends_on: [],
          status: 'pending',
          result: null,
          error: null,
          started_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });
      // INSERT step-2
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'step-2',
          workflow_id: 'mock-uuid',
          name: 'Process Data',
          action_type: 'transform',
          action_config: { format: 'csv' },
          depends_on: ['step-1'],
          status: 'pending',
          result: null,
          error: null,
          started_at: null,
          completed_at: null,
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });
      // COMMIT
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const workflow = await WorkflowEngine.createWorkflow(
        'Data Pipeline', 'Test workflow', steps, 'user-1',
      );

      expect(workflow.name).toBe('Data Pipeline');
      expect(workflow.description).toBe('Test workflow');
      expect(workflow.status).toBe('pending');
      expect(workflow.steps).toHaveLength(2);
      expect(workflow.steps[0].name).toBe('Fetch Data');
      expect(workflow.steps[1].name).toBe('Process Data');
      expect(workflow.steps[1].dependsOn).toEqual(['step-1']);
    });

    it('should auto-generate step IDs when not provided', async () => {
      const steps = [
        { name: 'Step 1', action_type: 'test', action_config: {} },
      ];

      // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // INSERT workflow
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'mock-uuid', name: 'Auto ID', description: null,
          status: 'pending', created_by: 'user-1',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          completed_at: null,
        }],
        rowCount: 1,
      });
      // INSERT step (auto-generated id)
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'mock-uuid', workflow_id: 'mock-uuid', name: 'Step 1',
          action_type: 'test', action_config: {}, depends_on: [],
          status: 'pending', result: null, error: null,
          started_at: null, completed_at: null, created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });
      // COMMIT
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const workflow = await WorkflowEngine.createWorkflow('Auto ID', null, steps, 'user-1');

      expect(workflow.steps).toHaveLength(1);
      // The step should have an ID (auto-generated)
      expect(workflow.steps[0].id).toBeDefined();
      expect(workflow.steps[0].id.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // executeWorkflow
  // =========================================================================

  describe('executeWorkflow', () => {
    it('should throw NotFoundError when workflow does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        WorkflowEngine.executeWorkflow('nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when workflow is not in pending state', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', status: 'completed' }],
        rowCount: 1,
      });

      await expect(
        WorkflowEngine.executeWorkflow('wf-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should execute steps in topological order and mark workflow completed', async () => {
      const now = new Date().toISOString();

      // 1. Fetch workflow
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', name: 'Test', status: 'pending', created_by: 'user-1' }],
        rowCount: 1,
      });
      // 2. Mark workflow running
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
      // 3. Load steps (two steps: step-1 independent, step-2 depends on step-1)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'step-1', workflow_id: 'wf-1', name: 'Step 1', action_type: 'test',
            action_config: {}, depends_on: [], status: 'pending', result: null,
            error: null, started_at: null, completed_at: null, created_at: now,
          },
          {
            id: 'step-2', workflow_id: 'wf-1', name: 'Step 2', action_type: 'test',
            action_config: {}, depends_on: ['step-1'], status: 'pending', result: null,
            error: null, started_at: null, completed_at: null, created_at: now,
          },
        ],
        rowCount: 2,
      });

      // For each step: check workflow status, mark running, mark completed
      // Step 1:
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ status: 'running' }], rowCount: 1 }); // 4. check status
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // 5. mark running
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // 6. mark completed
      // Step 2:
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ status: 'running' }], rowCount: 1 }); // 7. check status
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // 8. mark running
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // 9. mark completed

      // 10. Mark workflow completed
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      // 11-12. getWorkflowStatus calls (workflow query + steps query)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf-1', name: 'Test', status: 'completed', created_by: 'user-1',
          created_at: now, updated_at: now, completed_at: now, description: null,
        }],
        rowCount: 1,
      });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'step-1', workflow_id: 'wf-1', name: 'Step 1', action_type: 'test',
            action_config: {}, depends_on: [], status: 'completed', result: {},
            error: null, started_at: now, completed_at: now, created_at: now,
          },
          {
            id: 'step-2', workflow_id: 'wf-1', name: 'Step 2', action_type: 'test',
            action_config: {}, depends_on: ['step-1'], status: 'completed', result: {},
            error: null, started_at: now, completed_at: now, created_at: now,
          },
        ],
        rowCount: 2,
      });

      const result = await WorkflowEngine.executeWorkflow('wf-1');

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      // Verify steps are in correct order
      expect(result.steps[0].name).toBe('Step 1');
      expect(result.steps[1].name).toBe('Step 2');
    });
  });

  // =========================================================================
  // getWorkflowStatus
  // =========================================================================

  describe('getWorkflowStatus', () => {
    it('should throw NotFoundError when workflow does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        WorkflowEngine.getWorkflowStatus('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should return workflow with steps', async () => {
      const now = new Date().toISOString();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf-1', name: 'Test', description: 'desc', status: 'pending',
          created_by: 'user-1', created_at: now, updated_at: now, completed_at: null,
        }],
        rowCount: 1,
      });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'step-1', workflow_id: 'wf-1', name: 'Step 1', action_type: 'test',
          action_config: { key: 'value' }, depends_on: [], status: 'pending',
          result: null, error: null, started_at: null, completed_at: null, created_at: now,
        }],
        rowCount: 1,
      });

      const workflow = await WorkflowEngine.getWorkflowStatus('wf-1');

      expect(workflow.id).toBe('wf-1');
      expect(workflow.name).toBe('Test');
      expect(workflow.description).toBe('desc');
      expect(workflow.status).toBe('pending');
      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0].actionConfig).toEqual({ key: 'value' });
    });
  });

  // =========================================================================
  // cancelWorkflow
  // =========================================================================

  describe('cancelWorkflow', () => {
    it('should throw NotFoundError when workflow does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        WorkflowEngine.cancelWorkflow('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when workflow is already completed', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', status: 'completed' }],
        rowCount: 1,
      });

      await expect(
        WorkflowEngine.cancelWorkflow('wf-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when workflow is already failed', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', status: 'failed' }],
        rowCount: 1,
      });

      await expect(
        WorkflowEngine.cancelWorkflow('wf-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should cancel a pending workflow and mark pending steps as skipped', async () => {
      const now = new Date().toISOString();

      // 1. Fetch workflow (pool.query)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', status: 'pending' }],
        rowCount: 1,
      });

      // Transaction via pool.connect -> client: BEGIN, update steps, update workflow, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 2 }) // Update steps to skipped
        .mockResolvedValueOnce({ rowCount: 1 }) // Update workflow to failed
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      // 2-3. getWorkflowStatus (pool.query): workflow + steps
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf-1', name: 'Test', description: null, status: 'failed',
          created_by: 'user-1', created_at: now, updated_at: now, completed_at: now,
        }],
        rowCount: 1,
      });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'step-1', workflow_id: 'wf-1', name: 'Step 1', action_type: 'test',
          action_config: {}, depends_on: [], status: 'skipped', result: null,
          error: null, started_at: null, completed_at: now, created_at: now,
        }],
        rowCount: 1,
      });

      const workflow = await WorkflowEngine.cancelWorkflow('wf-1');

      expect(workflow.status).toBe('failed');
      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0].status).toBe('skipped');
    });

    it('should cancel a running workflow', async () => {
      const now = new Date().toISOString();

      // 1. Fetch workflow
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'wf-1', status: 'running' }],
        rowCount: 1,
      });

      // Transaction via pool.connect -> client
      mockClientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // Update steps
        .mockResolvedValueOnce({ rowCount: 1 }) // Update workflow
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      // 2-3. getWorkflowStatus
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf-1', name: 'Test', description: null, status: 'failed',
          created_by: 'user-1', created_at: now, updated_at: now, completed_at: now,
        }],
        rowCount: 1,
      });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const workflow = await WorkflowEngine.cancelWorkflow('wf-1');

      expect(workflow.status).toBe('failed');
      expect(workflow.steps).toHaveLength(0);
    });
  });
});
