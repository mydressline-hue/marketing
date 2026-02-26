# AI International Growth Engine - Deployment Guide

## Prerequisites

| Dependency   | Minimum Version | Notes                                     |
| ------------ | --------------- | ----------------------------------------- |
| Node.js      | 18.0+           | LTS recommended (v20 preferred)           |
| PostgreSQL   | 15.0+           | With `gen_random_uuid()` support           |
| Redis        | 7.0+            | TLS support required for production       |
| npm          | 9.0+            | Ships with Node 18+                       |
| TypeScript   | 5.6+            | Dev dependency, installed via npm          |

## Environment Variables

All variables are validated on startup via Zod. In production, missing required
variables will prevent the server from starting.

### Application

| Variable       | Required    | Default         | Description                          |
| -------------- | ----------- | --------------- | ------------------------------------ |
| `NODE_ENV`     | No          | `development`   | `development`, `production`, `test`  |
| `PORT`         | No          | `3001`          | HTTP server port                     |
| `API_PREFIX`   | No          | `/api/v1`       | API route prefix                     |

### Database (PostgreSQL)

| Variable       | Required       | Default                                      | Description                    |
| -------------- | -------------- | -------------------------------------------- | ------------------------------ |
| `DATABASE_URL` | Yes (prod)     | `postgresql://localhost:5432/ai_growth_engine_dev` | PostgreSQL connection string |
| `DB_POOL_MIN`  | No             | `2`                                          | Minimum pool connections       |
| `DB_POOL_MAX`  | No             | `10`                                         | Maximum pool connections       |
| `DB_SSL`       | No             | `false`                                      | Enable SSL for DB connection   |
| `DB_SSL_CA`    | No             | -                                            | SSL CA certificate (prod)      |

### Redis

| Variable         | Required | Default                  | Description                |
| ---------------- | -------- | ------------------------ | -------------------------- |
| `REDIS_URL`      | No       | `redis://localhost:6379` | Redis connection URL       |
| `REDIS_PASSWORD`  | No      | -                        | Redis authentication       |
| `REDIS_DB`       | No       | `0`                      | Redis database number      |
| `REDIS_TLS_CA`   | No       | -                        | TLS CA certificate (prod)  |

### Authentication & Security

| Variable                | Required    | Default                          | Description                  |
| ----------------------- | ----------- | -------------------------------- | ---------------------------- |
| `JWT_SECRET`            | Yes (prod)  | `dev-secret-do-not-use-in-prod`  | JWT signing secret           |
| `JWT_EXPIRES_IN`        | No          | `24h`                            | Access token TTL             |
| `JWT_REFRESH_EXPIRES_IN`| No          | `7d`                             | Refresh token TTL            |
| `ENCRYPTION_KEY`        | Yes (prod)  | -                                | Data encryption key          |
| `MFA_ISSUER`            | No          | `AIGrowthEngine`                 | MFA TOTP issuer name         |

### AI / Anthropic

| Variable                | Required | Default                      | Description               |
| ----------------------- | -------- | ---------------------------- | ------------------------- |
| `ANTHROPIC_API_KEY`     | No       | -                            | Anthropic API key         |
| `ANTHROPIC_OPUS_MODEL`  | No       | `claude-opus-4-20250514`     | Opus model identifier     |
| `ANTHROPIC_SONNET_MODEL`| No       | `claude-sonnet-4-20250514`   | Sonnet model identifier   |

### Rate Limiting

| Variable                   | Required | Default  | Description               |
| -------------------------- | -------- | -------- | ------------------------- |
| `RATE_LIMIT_WINDOW_MS`     | No       | `900000` | Rate limit window (ms)    |
| `RATE_LIMIT_MAX_REQUESTS`  | No       | `100`    | Max requests per window   |

### Logging

| Variable     | Required | Default | Description                        |
| ------------ | -------- | ------- | ---------------------------------- |
| `LOG_LEVEL`  | No       | `info`  | `debug`, `info`, `warn`, `error`   |
| `LOG_FORMAT` | No       | `json`  | `json` or `simple`                 |

### CORS

| Variable       | Required | Default                  | Description                      |
| -------------- | -------- | ------------------------ | -------------------------------- |
| `CORS_ORIGINS` | No       | `http://localhost:5173`  | Comma-separated allowed origins  |

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd marketing/server

# Install dependencies
npm ci

# Copy environment file and configure
cp .env.example .env
# Edit .env with your values
```

## Database Setup

### 1. Create the database

```bash
createdb ai_growth_engine
# Or for production:
createdb ai_growth_engine_prod
```

### 2. Run migrations

Migrations are applied sequentially (001 through 006). The runner tracks
applied migrations in a `_migrations` table to prevent re-execution.

```bash
# Run all pending migrations
npm run migrate

# Verify migrations are in order
npx tsx src/migrations/verify.ts
```

### Migration files

| File                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `001_initial_schema.sql`       | Core tables (users, countries, campaigns, etc) |
| `002_phase5_phase6_tables.sql` | Integration and agent tables                  |
| `003_phase7_tables.sql`        | Advanced AI and monitoring tables             |
| `004_phase8_tables.sql`        | Queue, rate limit, dashboard tables           |
| `005_new_features.sql`         | Notifications, audit, API keys                |
| `006_final_outputs.sql`        | Final output snapshots, validations, maturity |

### 3. Seed data (optional, development only)

```bash
npm run seed
```

## Building

```bash
# TypeScript compilation
npm run build

# The compiled output is in ./dist/
```

## Starting the Server

### Development

```bash
# Start with hot-reload (tsx watch)
npm run dev
```

### Production

```bash
# Build first
npm run build

# Start the compiled server
NODE_ENV=production npm start
```

### Using PM2 (recommended for production)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name ai-growth-engine \
  --env production \
  --max-memory-restart 1G \
  --instances max

# Save PM2 process list
pm2 save

# Setup startup script
pm2 startup
```

## Health Check Verification

After starting the server, verify it is healthy:

### Basic health (public, for load balancers)

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0","environment":"production"}
```

### Readiness probe (Kubernetes)

```bash
curl http://localhost:3001/health/ready
# Expected: {"ready":true,"checks":{"postgresql":true,"redis":true}}
```

### Liveness probe (Kubernetes)

```bash
curl http://localhost:3001/health/live
# Expected: {"alive":true,"pid":...,"uptime":...}
```

### Deep health check (authenticated, admin only)

```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/health/deep
```

The deep health check verifies:

- **PostgreSQL**: Connection, latency, pool stats
- **Redis**: Connection, latency, memory usage, client count
- **Integrations**: Platform, CRM, and analytics connection status
- **Agent System**: Total/active agents, recent decisions, confidence scores
- **Final Outputs**: Deliverable availability, generation capability
- **Memory**: RSS, heap, external memory
- **Disk**: Filesystem usage percentage

## Monitoring and Alerts

### Recommended monitoring setup

1. **Health endpoint polling**: Poll `/health` every 30 seconds from your load balancer
2. **Deep health polling**: Poll `/health/deep` every 5 minutes for detailed status
3. **Historical health**: Query `/health/history` for trend analysis (stored in Redis, 24h retention)

### Key metrics to monitor

| Metric                         | Warning Threshold | Critical Threshold |
| ------------------------------ | ----------------- | ------------------ |
| PostgreSQL latency             | > 100ms           | > 500ms or down    |
| Redis latency                  | > 50ms            | > 200ms or down    |
| Memory (heap used)             | > 80% of total    | > 95% of total     |
| Disk usage                     | > 80%             | > 95%              |
| Agent confidence (avg)         | < 70%             | < 50%              |
| Final outputs availability     | < 6 deliverables  | 0 deliverables     |
| Integration disconnects        | Any degraded      | Any disconnected   |

### Alert channels

Configure alerting via environment variables or your infrastructure provider:

- **Slack**: Webhook URL for channel notifications
- **PagerDuty**: Integration for on-call escalation
- **Email**: SMTP for email alerts

## Kill Switch Operation

The kill switch provides emergency shutdown capabilities for the AI agent system.

### Activate kill switch

```bash
# Via API (requires admin authentication)
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Emergency shutdown","scope":"all"}' \
  http://localhost:3001/api/v1/killswitch/activate
```

### Deactivate kill switch

```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Issue resolved"}' \
  http://localhost:3001/api/v1/killswitch/deactivate
```

### Check kill switch status

```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/api/v1/killswitch/status
```

## Troubleshooting

### Server fails to start

**Symptom**: `Invalid environment variables` error on startup.

**Solution**: In production, `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY`
are required. Verify all required environment variables are set.

```bash
# Check which variables are missing
NODE_ENV=production node -e "require('./dist/config/env')"
```

### Database connection failure

**Symptom**: `Database connection failed after 3 attempts`

**Solution**:
1. Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Check `DATABASE_URL` is correct
3. If using SSL, ensure `DB_SSL=true` and certificates are valid
4. Check connection pool limits (`DB_POOL_MAX`) are not exhausted

### Redis connection failure

**Symptom**: `Redis: max retry attempts reached`

**Solution**:
1. Verify Redis is running: `redis-cli ping`
2. Check `REDIS_URL` is correct
3. If using TLS in production, verify certificate paths
4. Check Redis memory usage: `redis-cli info memory`

### Migrations fail

**Symptom**: `[FAIL] Migration failed to apply`

**Solution**:
1. Check PostgreSQL connectivity first
2. Run `npx tsx src/migrations/verify.ts` to check file integrity
3. Check `_migrations` table for partially applied migrations
4. If a migration was partially applied, manually rollback and retry

```sql
-- Check applied migrations
SELECT * FROM _migrations ORDER BY id;

-- Remove last failed entry if needed (use with caution)
DELETE FROM _migrations WHERE filename = '<failed_migration>';
```

### High memory usage

**Symptom**: Process memory exceeds thresholds

**Solution**:
1. Check `/health/deep` for memory stats
2. Review for memory leaks using `--inspect` flag
3. Consider reducing `DB_POOL_MAX` if idle connections are high
4. Restart with PM2 auto-restart: `--max-memory-restart 1G`

### Agent system degraded

**Symptom**: Health check shows agents as `degraded` or `down`

**Solution**:
1. Check `/health/deep` for agent system details
2. Verify `agent_decisions` table is accessible
3. Check if Anthropic API key is valid
4. Review agent logs for error patterns
5. If needed, use kill switch to pause agent operations

### Final outputs unavailable

**Symptom**: Final outputs health check shows `unavailable`

**Solution**:
1. Verify agent decisions exist: `SELECT COUNT(*) FROM agent_decisions`
2. Check if all 6 core agent types have decisions
3. Review confidence scores -- very low scores indicate data quality issues
4. Run agents manually to regenerate decisions if needed

## CI/CD Pipeline

The CI/CD pipeline is defined in `ci/pipeline.yml` and runs:

1. **Lint**: TypeScript compilation check + ESLint
2. **Unit Tests**: Fast, isolated tests (no external dependencies)
3. **Integration Tests**: Tests with PostgreSQL and Redis services
4. **E2E Tests**: Full stack tests with seeded data
5. **Build**: Production TypeScript compilation
6. **Deploy**: Automated deployment to staging/production

### Running tests locally

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires PostgreSQL + Redis)
npm run test:integration

# E2E tests (requires full stack)
npm run test:e2e

# Lint
npm run lint
```
