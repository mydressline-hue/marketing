# AI International Growth Engine

An AI-powered marketing platform for international market expansion. The system orchestrates 20 autonomous AI agents -- powered by Anthropic Claude (Opus and Sonnet) -- to manage multi-country campaigns, optimize budgets, generate creative content, and deliver real-time performance analytics.

## Architecture

```
                          +--------------------------+
                          |       Clients / CDN      |
                          +------------+-------------+
                                       |
                                       v
                          +------------+-------------+
                          |    nginx  (UI container)  |
                          |   - SPA serving           |
                          |   - gzip, security hdrs   |
                          |   - /api/* reverse proxy  |
                          +------------+-------------+
                                       |
                            /api/*     |     /*
                          +------------+-------------+
                          |  Express API  (Node.js)   |
                          |  - REST endpoints         |
                          |  - Auth (JWT + MFA)        |
                          |  - Rate limiting           |
                          +--+------------------+-----+
                             |                  |
            +----------------+--+          +----+------------+
            |  20 AI Agents     |          |  PostgreSQL 16  |
            |  (Claude Opus +   |          |  (Primary DB)   |
            |   Sonnet)         |          +-----------------+
            +--------+----------+
                     |
            +--------+----------+
            |     Redis 7       |
            |  (Cache / Queue)  |
            +-------------------+

AI Agent Modules:
  - Country Strategy         - Paid Ads
  - Budget Optimization      - Organic Social
  - Creative Generation      - Content / Blog
  - Market Intelligence      - Competitive Intel
  - Performance Analytics    - Conversion Optimization
  - Revenue Forecasting      - A/B Testing
  - Localization             - Compliance
  - Brand Consistency        - Fraud Detection
  - Data Engineering         - Enterprise Security
  - Shopify Integration      - Orchestrator (cross-challenge verification)
```

### Tech Stack

| Layer            | Technology                                                    |
|------------------|---------------------------------------------------------------|
| **Frontend**     | React 19, TypeScript, Vite 7, Tailwind CSS 4, Recharts 3     |
| **Backend**      | Node.js 20, Express, TypeScript, Zod                         |
| **AI**           | Anthropic Claude (Opus + Sonnet), cross-challenge verification|
| **Database**     | PostgreSQL 16                                                 |
| **Cache / Queue**| Redis 7                                                       |
| **Auth**         | JWT + MFA (TOTP), bcrypt, AES-256 encryption                 |
| **Infra**        | Docker, docker compose, nginx, GitHub Actions CI/CD           |
| **Testing**      | Jest (server), Vitest + Testing Library (UI), MSW             |

---

## Quick Start

### With Docker (recommended)

```bash
# 1. Clone the repository
git clone <repo-url> && cd marketing

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env and set at minimum:
#   DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY

# 3. Start all services
docker compose up -d

# 4. Run database migrations and seed data
docker compose exec server node -e "require('./dist/migrations/run')"
# or: cd server && npm run migrate && npm run seed

# 5. Open the application
open http://localhost
```

### Without Docker (manual setup)

Prerequisites: Node.js 20+, PostgreSQL 16+, Redis 7+

```bash
# 1. Start infrastructure services (option A: use dev compose)
docker compose -f docker-compose.dev.yml up -d

# -- OR -- (option B: start postgres and redis natively)
# Ensure PostgreSQL and Redis are running on default ports

# 2. Server
cd server
cp .env.example .env        # then edit .env with your DB credentials
npm install
npm run migrate
npm run seed
npm run dev                  # starts on http://localhost:3001

# 3. UI (in a new terminal)
cd ui
npm install
npm run dev                  # starts on http://localhost:5173
```

---

## Environment Variables

All server configuration is managed through environment variables. See `server/.env.example` for development defaults and `server/.env.production.example` for production guidance.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | No | `3001` | Server listen port |
| `DATABASE_URL` | **Yes (prod)** | `localhost` | PostgreSQL connection string |
| `DB_POOL_MIN` | No | `2` | Minimum database pool connections |
| `DB_POOL_MAX` | No | `10` | Maximum database pool connections |
| `DB_SSL` | No | `false` | Enable SSL for database connections |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `REDIS_PASSWORD` | No | -- | Redis authentication password |
| `JWT_SECRET` | **Yes (prod)** | -- | JWT signing secret (minimum 32 characters) |
| `JWT_EXPIRES_IN` | No | `24h` | JWT token expiry duration |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiry duration |
| `ENCRYPTION_KEY` | **Yes (prod)** | -- | AES-256 encryption key (exactly 32 characters) |
| `ANTHROPIC_API_KEY` | No | -- | Enables AI agent features when set |
| `ANTHROPIC_OPUS_MODEL` | No | `claude-opus-4-20250514` | Claude Opus model identifier |
| `ANTHROPIC_SONNET_MODEL` | No | `claude-sonnet-4-20250514` | Claude Sonnet model identifier |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (15 min default) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `LOG_FORMAT` | No | `json` | Log output format |
| `CORS_ORIGINS` | No | `localhost:5173` | Allowed CORS origins (comma-separated) |
| `MFA_ISSUER` | No | `AIGrowthEngine` | TOTP issuer label for MFA |

---

## Testing

```bash
# ── Server ──────────────────────────────────────────────
cd server

npm test                        # Run all server tests
npm run test:unit               # Unit tests only
npm run test:integration        # Integration tests only
npm run test:e2e                # End-to-end tests only
npm test -- --coverage          # Tests with coverage report

# ── UI ──────────────────────────────────────────────────
cd ui

npm test                        # Run all UI tests (single run)
npm run test:watch              # Watch mode for development
npm run test:coverage           # Tests with coverage report

# ── Lint ────────────────────────────────────────────────
cd server && npm run lint       # Lint server code
cd ui && npm run lint           # Lint UI code
```

---

## Project Structure

```
marketing/
├── server/                     # Backend API
│   ├── src/
│   │   ├── agents/             # 20 AI agent modules + orchestrator
│   │   ├── config/             # App configuration
│   │   ├── controllers/        # Route handlers
│   │   ├── middleware/         # Auth, rate-limiting, validation
│   │   ├── migrations/        # Database migrations
│   │   ├── models/            # Data models
│   │   ├── routes/            # Express route definitions
│   │   ├── seeds/             # Seed data
│   │   ├── services/          # Business logic
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Shared utilities
│   │   └── validators/        # Zod schemas
│   ├── tests/                 # Jest test suites
│   ├── Dockerfile             # Multi-stage production build
│   └── package.json
├── ui/                        # Frontend SPA
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── context/           # React context providers
│   │   ├── hooks/             # Custom hooks
│   │   ├── pages/             # Page-level components
│   │   ├── providers/         # App providers
│   │   ├── services/          # API client services
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # Utilities
│   ├── tests/                 # Vitest + Testing Library tests
│   ├── nginx.conf             # Production nginx config
│   ├── Dockerfile             # Multi-stage build (Node -> nginx)
│   └── package.json
├── docker-compose.yml         # Full production stack
├── docker-compose.dev.yml     # Dev infrastructure (postgres + redis)
└── .github/workflows/ci.yml  # CI pipeline
```

---

## Docker

### Production

```bash
docker compose up -d              # Start all services
docker compose logs -f server     # Tail server logs
docker compose down               # Stop all services
docker compose down -v            # Stop and remove volumes
```

### Development (infrastructure only)

```bash
docker compose -f docker-compose.dev.yml up -d   # Start postgres + redis
docker compose -f docker-compose.dev.yml down     # Stop infrastructure
```

---

## CI/CD

The GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. **Lint & Typecheck** -- ESLint and TypeScript compiler checks for both server and UI
2. **Server Tests** -- Jest test suite with PostgreSQL 16 and Redis 7 service containers
3. **UI Tests** -- Vitest + Testing Library suite with coverage
4. **Build Verification** -- Confirms both server and UI produce valid build artifacts

---

## Deployment

For production deployment guidance, see `server/DEPLOYMENT.md`.

---

## License

Proprietary. All rights reserved.
