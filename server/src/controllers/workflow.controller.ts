/**
 * Workflow Controller – Express request handlers for the Workflow Engine.
 *
 * Each handler delegates to `WorkflowEngine` and returns a structured JSON
 * envelope: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /workflows
 * Create a new workflow with steps and dependency declarations.
 */
export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, steps } = req.body;
  const userId = req.user!.id;

  const workflow = await WorkflowEngine.createWorkflow(
    name,
    description ?? null,
    steps ?? [],
    userId,
  );

  res.status(201).json({
    success: true,
    data: workflow,
  });
});

/**
 * POST /workflows/:id/execute
 * Start executing a pending workflow.
 */
export const executeWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await WorkflowEngine.executeWorkflow(req.params.id);

  res.json({
    success: true,
    data: workflow,
  });
});

/**
 * GET /workflows/:id
 * Retrieve full workflow status including all steps.
 */
export const getWorkflowStatus = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await WorkflowEngine.getWorkflowStatus(req.params.id);

  res.json({
    success: true,
    data: workflow,
  });
});

/**
 * DELETE /workflows/:id
 * Cancel a running or pending workflow.
 */
export const cancelWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await WorkflowEngine.cancelWorkflow(req.params.id);

  res.json({
    success: true,
    data: workflow,
  });
});
