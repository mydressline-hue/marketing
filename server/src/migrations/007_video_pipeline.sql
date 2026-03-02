-- ============================================================================
-- 007_video_pipeline.sql
-- Kling AI Video Pipeline - Video generation, text enhancement, social publish
-- ============================================================================

-- ============================================================================
-- 1. VIDEO GENERATION TASKS
-- Tracks Kling AI video generation requests and their lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_generation_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      UUID,
    title           VARCHAR(500) NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    kling_task_id   VARCHAR(255),
    model           VARCHAR(100) NOT NULL DEFAULT 'kling-v1',
    mode            VARCHAR(50) NOT NULL DEFAULT 'image_to_video',
    duration         INTEGER NOT NULL DEFAULT 5,
    aspect_ratio    VARCHAR(20) NOT NULL DEFAULT '9:16',
    prompt          TEXT,
    negative_prompt TEXT,
    source_image_url TEXT,
    video_url       TEXT,
    thumbnail_url   TEXT,
    error_message   TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT video_gen_status_check CHECK (
        status IN ('pending', 'submitted', 'processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT video_gen_mode_check CHECK (
        mode IN ('image_to_video', 'text_to_video')
    ),
    CONSTRAINT video_gen_duration_check CHECK (
        duration IN (5, 10)
    ),
    CONSTRAINT video_gen_aspect_check CHECK (
        aspect_ratio IN ('1:1', '16:9', '9:16', '4:3', '3:4')
    )
);

CREATE INDEX idx_video_gen_user_id ON video_generation_tasks (user_id);
CREATE INDEX idx_video_gen_status ON video_generation_tasks (status);
CREATE INDEX idx_video_gen_product_id ON video_generation_tasks (product_id);
CREATE INDEX idx_video_gen_kling_task_id ON video_generation_tasks (kling_task_id);
CREATE INDEX idx_video_gen_created_at ON video_generation_tasks (created_at);

CREATE TRIGGER set_updated_at_video_gen
    BEFORE UPDATE ON video_generation_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. TEXT ENHANCEMENTS
-- AI-generated marketing captions, hashtags, CTAs per platform
-- ============================================================================
CREATE TABLE IF NOT EXISTS text_enhancements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_task_id       UUID NOT NULL REFERENCES video_generation_tasks(id) ON DELETE CASCADE,
    platform            VARCHAR(50) NOT NULL,
    caption             TEXT,
    hashtags            TEXT[],
    call_to_action      TEXT,
    tone                VARCHAR(50) DEFAULT 'engaging',
    language            VARCHAR(10) DEFAULT 'en',
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT text_enh_platform_check CHECK (
        platform IN ('instagram', 'tiktok', 'facebook', 'youtube', 'twitter', 'linkedin')
    )
);

CREATE INDEX idx_text_enh_video_task_id ON text_enhancements (video_task_id);
CREATE INDEX idx_text_enh_platform ON text_enhancements (platform);

CREATE TRIGGER set_updated_at_text_enh
    BEFORE UPDATE ON text_enhancements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. SOCIAL PUBLISH RECORDS
-- Tracks publishing of videos + text to social platforms
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_publish_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_task_id       UUID NOT NULL REFERENCES video_generation_tasks(id) ON DELETE CASCADE,
    text_enhancement_id UUID REFERENCES text_enhancements(id) ON DELETE SET NULL,
    platform            VARCHAR(50) NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    external_post_id    VARCHAR(255),
    post_url            TEXT,
    caption             TEXT,
    hashtags            TEXT[],
    call_to_action      TEXT,
    scheduled_at        TIMESTAMPTZ,
    published_at        TIMESTAMPTZ,
    error_message       TEXT,
    engagement          JSONB NOT NULL DEFAULT '{}',
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT social_pub_platform_check CHECK (
        platform IN ('instagram', 'tiktok', 'facebook', 'youtube', 'twitter', 'linkedin')
    ),
    CONSTRAINT social_pub_status_check CHECK (
        status IN ('pending', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')
    )
);

CREATE INDEX idx_social_pub_video_task_id ON social_publish_records (video_task_id);
CREATE INDEX idx_social_pub_platform ON social_publish_records (platform);
CREATE INDEX idx_social_pub_status ON social_publish_records (status);
CREATE INDEX idx_social_pub_published_at ON social_publish_records (published_at);
CREATE INDEX idx_social_pub_created_at ON social_publish_records (created_at);

CREATE TRIGGER set_updated_at_social_pub
    BEFORE UPDATE ON social_publish_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. VIDEO PIPELINE RUNS
-- Orchestrates the full pipeline: product → video → text → publish
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_pipeline_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_task_id       UUID REFERENCES video_generation_tasks(id) ON DELETE SET NULL,
    product_id          UUID,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    target_platforms    TEXT[] NOT NULL DEFAULT '{}',
    config              JSONB NOT NULL DEFAULT '{}',
    results             JSONB NOT NULL DEFAULT '{}',
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pipeline_run_status_check CHECK (
        status IN ('pending', 'generating_video', 'enhancing_text', 'publishing', 'completed', 'failed', 'partial')
    )
);

CREATE INDEX idx_pipeline_run_user_id ON video_pipeline_runs (user_id);
CREATE INDEX idx_pipeline_run_status ON video_pipeline_runs (status);
CREATE INDEX idx_pipeline_run_product_id ON video_pipeline_runs (product_id);
CREATE INDEX idx_pipeline_run_created_at ON video_pipeline_runs (created_at);

CREATE TRIGGER set_updated_at_pipeline_run
    BEFORE UPDATE ON video_pipeline_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
