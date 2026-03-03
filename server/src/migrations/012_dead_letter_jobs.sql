-- ============================================================================
-- 012_dead_letter_jobs.sql
-- Dead Letter Queue - stores jobs that have exhausted all retry attempts
-- ============================================================================

-- ============================================================================
-- 1. DEAD_LETTER_JOBS TABLE
-- Preserves the original job payload and error information for debugging.
-- Jobs land here after exceeding their maximum retry count, and can be
-- manually retried via the admin API.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id               TEXT PRIMARY KEY,
    original_job_id  TEXT NOT NULL,
    type             TEXT NOT NULL,
    payload          JSONB NOT NULL DEFAULT '{}',
    error            TEXT,
    attempts         INTEGER NOT NULL DEFAULT 0,
    failed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_original_job_id ON dead_letter_jobs (original_job_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_type ON dead_letter_jobs (type);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_failed_at ON dead_letter_jobs (failed_at);
