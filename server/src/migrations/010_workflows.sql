-- ============================================================================
-- 010_workflows.sql
-- Sequential Workflow Engine - Workflow and workflow step tables
-- ============================================================================

-- ============================================================================
-- 1. WORKFLOWS
-- Top-level workflow entity that groups a set of ordered steps. Each workflow
-- tracks its own lifecycle status independently of the underlying job queue.
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflows (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_workflows_created_by ON workflows (created_by);
CREATE INDEX idx_workflows_status ON workflows (status);
CREATE INDEX idx_workflows_created_at ON workflows (created_at);

-- ============================================================================
-- 2. WORKFLOW STEPS
-- Individual steps within a workflow. Each step declares its action type,
-- configuration, and an optional list of step IDs it depends on. The engine
-- uses this dependency graph for topological ordering and failure propagation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_steps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    action_config   JSONB NOT NULL DEFAULT '{}',
    depends_on      TEXT[] NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    result          JSONB,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps (workflow_id);
CREATE INDEX idx_workflow_steps_status ON workflow_steps (status);
CREATE INDEX idx_workflow_steps_workflow_id_status ON workflow_steps (workflow_id, status);
