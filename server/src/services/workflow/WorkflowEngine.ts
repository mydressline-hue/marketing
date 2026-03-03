/**
 * Workflow Engine – Sequential workflow execution with dependency resolution.
 *
 * Provides methods to create, execute, query, and cancel workflows composed
 * of dependent steps. Steps are topologically sorted and executed sequentially;
 * if a step fails, all steps that transitively depend on it are marked as
 * skipped.
 */

import { pool } from '../../config/database';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { topologicalSort, type GraphNode } from './topological-sort';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStepInput {
  id?: string;
  name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  depends_on?: string[];
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  name: string;
  actionType: string;
  actionConfig: Record<string, unknown>;
  dependsOn: string[];
  status: StepStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToWorkflow(row: Record<string, unknown>, steps: WorkflowStep[] = []): Workflow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    status: row.status as WorkflowStatus,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string) ?? null,
    steps,
  };
}

function rowToStep(row: Record<string, unknown>): WorkflowStep {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    name: row.name as string,
    actionType: row.action_type as string,
    actionConfig: (row.action_config as Record<string, unknown>) ?? {},
    dependsOn: (row.depends_on as string[]) ?? [],
    status: row.status as StepStatus,
    result: (row.result as Record<string, unknown>) ?? null,
    error: (row.error as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Step action executor
// ---------------------------------------------------------------------------

/**
 * Execute a single workflow step's action.
 *
 * This is the integration point where different action_type values map to
 * concrete processing logic. Currently provides a generic executor that
 * returns the action config as the result; extend with real action handlers
 * as needed (e.g. call an agent, trigger an HTTP request, run a query).
 */
async function executeStepAction(
  step: WorkflowStep,
  _previousResults: Map<string, Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  // Dispatch based on action_type. Extensible via a registry pattern.
  switch (step.actionType) {
    default:
      // Generic passthrough – records that the step was executed with
      // its configuration. Real implementations should replace / extend this.
      return {
        executed: true,
        actionType: step.actionType,
        actionConfig: step.actionConfig,
        executedAt: new Date().toISOString(),
      };
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class WorkflowEngine {
  /**
   * Create a new workflow together with its steps.
   *
   * Steps may optionally include a client-supplied `id`; if omitted a UUID
   * is generated. Dependencies in `depends_on` reference step IDs.
   * The dependency graph is validated (topological sort) before persisting.
   *
   * @param name        - Human-readable workflow name.
   * @param description - Optional description.
   * @param steps       - Ordered list of step definitions.
   * @param userId      - ID of the user creating the workflow.
   * @returns The fully hydrated workflow.
   */
  static async createWorkflow(
    name: string,
    description: string | null,
    steps: WorkflowStepInput[],
    userId: string,
  ): Promise<Workflow> {
    if (!name) {
      throw new ValidationError('Workflow name is required');
    }

    if (!steps || steps.length === 0) {
      throw new ValidationError('At least one workflow step is required');
    }

    // Assign IDs to steps that don't have one
    const stepsWithIds = steps.map((s) => ({
      ...s,
      id: s.id ?? generateId(),
      depends_on: s.depends_on ?? [],
    }));

    // Validate dependency graph (throws on cycle or unknown reference)
    const graphNodes: GraphNode[] = stepsWithIds.map((s) => ({
      id: s.id,
      dependsOn: s.depends_on,
    }));
    topologicalSort(graphNodes);

    // Persist inside a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workflowId = generateId();

      const wfResult = await client.query(
        `INSERT INTO workflows (id, name, description, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW())
         RETURNING *`,
        [workflowId, name, description, userId],
      );

      const savedSteps: WorkflowStep[] = [];

      for (const step of stepsWithIds) {
        const stepResult = await client.query(
          `INSERT INTO workflow_steps
             (id, workflow_id, name, action_type, action_config, depends_on, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
           RETURNING *`,
          [
            step.id,
            workflowId,
            step.name,
            step.action_type,
            JSON.stringify(step.action_config),
            step.depends_on,
          ],
        );
        savedSteps.push(rowToStep(stepResult.rows[0]));
      }

      await client.query('COMMIT');

      logger.info('Workflow created', { workflowId, name, stepCount: savedSteps.length });

      return rowToWorkflow(wfResult.rows[0], savedSteps);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a workflow by processing its steps sequentially in dependency
   * order (topological sort). If a step fails, all transitively dependent
   * steps are marked as skipped.
   *
   * @param workflowId - ID of the workflow to execute.
   * @returns The updated workflow after execution completes.
   */
  static async executeWorkflow(workflowId: string): Promise<Workflow> {
    // Fetch workflow
    const wfResult = await pool.query(
      `SELECT id, name, description, status, created_by, created_at, updated_at, completed_at FROM workflows WHERE id = $1`,
      [workflowId],
    );

    if (wfResult.rows.length === 0) {
      throw new NotFoundError(`Workflow with id '${workflowId}' not found`);
    }

    const wfRow = wfResult.rows[0];

    if (wfRow.status !== 'pending') {
      throw new ValidationError(
        `Workflow is already in '${wfRow.status}' state. Only pending workflows can be executed.`,
      );
    }

    // Mark workflow as running
    await pool.query(
      `UPDATE workflows SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [workflowId],
    );

    // Load all steps
    const stepsResult = await pool.query(
      `SELECT id, workflow_id, name, action_type, action_config, depends_on, status, result, error, started_at, completed_at, created_at FROM workflow_steps WHERE workflow_id = $1`,
      [workflowId],
    );
    const allSteps = stepsResult.rows.map(rowToStep);

    // Topological sort to determine execution order
    const graphNodes: GraphNode[] = allSteps.map((s) => ({
      id: s.id,
      dependsOn: s.dependsOn,
    }));
    const executionOrder = topologicalSort(graphNodes);

    // Build a map for quick step lookup
    const stepMap = new Map<string, WorkflowStep>();
    for (const step of allSteps) {
      stepMap.set(step.id, step);
    }

    // Track which steps have failed so we can skip their dependents
    const failedStepIds = new Set<string>();
    // Track results from completed steps (available to downstream steps)
    const previousResults = new Map<string, Record<string, unknown>>();

    let workflowFailed = false;

    for (const stepId of executionOrder) {
      const step = stepMap.get(stepId)!;

      // Check if workflow was cancelled mid-execution
      const currentWf = await pool.query(
        `SELECT status FROM workflows WHERE id = $1`,
        [workflowId],
      );
      if (currentWf.rows.length === 0 || currentWf.rows[0].status === 'failed') {
        // Workflow was cancelled or removed
        break;
      }

      // Determine if any dependency has failed
      const hasFailed = step.dependsOn.some((depId) => failedStepIds.has(depId));

      if (hasFailed) {
        // Skip this step and propagate the failure
        await pool.query(
          `UPDATE workflow_steps
           SET status = 'skipped', completed_at = NOW()
           WHERE id = $1`,
          [stepId],
        );
        failedStepIds.add(stepId);

        logger.info('Workflow step skipped (dependency failed)', {
          workflowId,
          stepId,
          stepName: step.name,
        });
        continue;
      }

      // Mark step as running
      await pool.query(
        `UPDATE workflow_steps
         SET status = 'running', started_at = NOW()
         WHERE id = $1`,
        [stepId],
      );

      logger.info('Workflow step started', {
        workflowId,
        stepId,
        stepName: step.name,
        actionType: step.actionType,
      });

      try {
        const result = await executeStepAction(step, previousResults);

        // Mark step as completed
        await pool.query(
          `UPDATE workflow_steps
           SET status = 'completed', result = $2, completed_at = NOW()
           WHERE id = $1`,
          [stepId, JSON.stringify(result)],
        );

        previousResults.set(stepId, result);

        logger.info('Workflow step completed', {
          workflowId,
          stepId,
          stepName: step.name,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Mark step as failed
        await pool.query(
          `UPDATE workflow_steps
           SET status = 'failed', error = $2, completed_at = NOW()
           WHERE id = $1`,
          [stepId, errorMessage],
        );

        failedStepIds.add(stepId);
        workflowFailed = true;

        logger.error('Workflow step failed', {
          workflowId,
          stepId,
          stepName: step.name,
          error: errorMessage,
        });
      }
    }

    // Determine final workflow status
    const finalStatus: WorkflowStatus = workflowFailed ? 'failed' : 'completed';

    await pool.query(
      `UPDATE workflows
       SET status = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [workflowId, finalStatus],
    );

    logger.info('Workflow execution finished', { workflowId, finalStatus });

    return WorkflowEngine.getWorkflowStatus(workflowId);
  }

  /**
   * Retrieve the full status of a workflow including all of its steps.
   *
   * @param workflowId - ID of the workflow.
   * @returns The workflow with its steps.
   * @throws NotFoundError if the workflow does not exist.
   */
  static async getWorkflowStatus(workflowId: string): Promise<Workflow> {
    const wfResult = await pool.query(
      `SELECT id, name, description, status, created_by, created_at, updated_at, completed_at FROM workflows WHERE id = $1`,
      [workflowId],
    );

    if (wfResult.rows.length === 0) {
      throw new NotFoundError(`Workflow with id '${workflowId}' not found`);
    }

    const stepsResult = await pool.query(
      `SELECT id, workflow_id, name, action_type, action_config, depends_on, status, result, error, started_at, completed_at, created_at FROM workflow_steps WHERE workflow_id = $1 ORDER BY created_at ASC`,
      [workflowId],
    );

    const steps = stepsResult.rows.map(rowToStep);

    return rowToWorkflow(wfResult.rows[0], steps);
  }

  /**
   * Cancel a running or pending workflow. Pending steps are marked as skipped.
   *
   * @param workflowId - ID of the workflow to cancel.
   * @returns The updated workflow.
   * @throws NotFoundError if the workflow does not exist.
   * @throws ValidationError if the workflow is already completed or failed.
   */
  static async cancelWorkflow(workflowId: string): Promise<Workflow> {
    const wfResult = await pool.query(
      `SELECT id, name, description, status, created_by, created_at, updated_at, completed_at FROM workflows WHERE id = $1`,
      [workflowId],
    );

    if (wfResult.rows.length === 0) {
      throw new NotFoundError(`Workflow with id '${workflowId}' not found`);
    }

    const currentStatus = wfResult.rows[0].status as WorkflowStatus;

    if (currentStatus === 'completed' || currentStatus === 'failed') {
      throw new ValidationError(
        `Cannot cancel a workflow in '${currentStatus}' state`,
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Mark all pending/running steps as skipped
      await client.query(
        `UPDATE workflow_steps
         SET status = 'skipped', completed_at = NOW()
         WHERE workflow_id = $1 AND status IN ('pending', 'running')`,
        [workflowId],
      );

      // Mark workflow as failed (cancelled)
      await client.query(
        `UPDATE workflows
         SET status = 'failed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [workflowId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info('Workflow cancelled', { workflowId });

    return WorkflowEngine.getWorkflowStatus(workflowId);
  }
}
