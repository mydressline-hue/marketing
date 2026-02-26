-- ============================================================================
-- Migration 005: New Features
--
-- Adds tables for: webhook ingest, job queue, notifications, platform rate
-- limits, and API key scoping.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Webhook Registrations & Events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_registrations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  platform_type VARCHAR(50) NOT NULL,
  webhook_url TEXT,
  secret TEXT NOT NULL,
  events TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_registrations_user ON webhook_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_platform ON webhook_registrations(platform_type);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY,
  platform_type VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'received',
  user_id UUID REFERENCES users(id),
  registration_id UUID REFERENCES webhook_registrations(id),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_platform ON webhook_events(platform_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Job Queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY,
  queue_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  result JSONB,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT job_queue_status_check CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'retrying'
  )),
  CONSTRAINT job_queue_priority_check CHECK (priority BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_queue ON job_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(job_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_created ON job_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_queue_queue_status ON job_queue(queue_name, status);
CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled ON job_queue(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channels TEXT[] DEFAULT '{}',
  priority VARCHAR(20) DEFAULT 'medium',
  category VARCHAR(50) DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id),
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries(notification_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  email_enabled BOOLEAN DEFAULT true,
  slack_enabled BOOLEAN DEFAULT false,
  in_app_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  alert_channels TEXT[] DEFAULT '{in_app,email}',
  system_channels TEXT[] DEFAULT '{in_app}',
  campaign_channels TEXT[] DEFAULT '{in_app,email}',
  integration_channels TEXT[] DEFAULT '{in_app}',
  security_channels TEXT[] DEFAULT '{in_app,email}',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. Platform Rate Limits
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  id UUID PRIMARY KEY,
  platform_type VARCHAR(50) NOT NULL UNIQUE,
  requests_per_second INTEGER,
  requests_per_minute INTEGER,
  requests_per_hour INTEGER,
  requests_per_day INTEGER,
  concurrent_limit INTEGER,
  custom_config JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_rate_limits_type ON platform_rate_limits(platform_type);

-- ---------------------------------------------------------------------------
-- 5. API Key Scopes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_key_scopes (
  id UUID PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  platforms TEXT[] DEFAULT '{}',
  ip_whitelist TEXT[] DEFAULT '{}',
  rate_limit_per_hour INTEGER,
  expires_at TIMESTAMPTZ,
  description TEXT,
  request_count_today INTEGER DEFAULT 0,
  request_count_total INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_scopes_key ON api_key_scopes(api_key_id);
