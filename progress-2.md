# AI International Growth Engine — Progress-2: Production Completion Plan

## Objective
Take the existing 70% alpha build to a **100% production-ready, fully tested, modern UI application** with zero fake data, zero hardcoded values, 95%+ test coverage on both backend and frontend, and a polished, customizable user interface.

## Reference Files
- **Spec:** `ai_international_growth_engine.md`
- **Previous progress:** `progress.md` (Phases 1–10 completed)
- **Deployment guide:** `server/DEPLOYMENT.md`
- **CI/CD pipeline:** `server/ci/pipeline.yml`

## Current State Assessment
| Area | Status | Gap |
|------|--------|-----|
| Backend services (150+ files) | Real PostgreSQL/Redis queries | Tests mock everything — no real DB integration tests |
| Anthropic AI integration | Real SDK calls with retry/fallback | API key is optional in env schema — should require or graceful-degrade |
| Frontend (23 pages, 13 components) | Real API hooks, WebSocket, code-split build | Only 2 test files exist (hooks + 1 integration) — need 95%+ coverage |
| UI dist build | Built successfully (63 JS/CSS chunks) | Needs rebuild after UI changes |
| Docker/Containers | None | No Dockerfile, no docker-compose |
| Dark mode | State exists in AppContext | CSS/components not wired to dark mode |
| Theme customization | Tailwind custom theme defined | No runtime theme switching, no user preferences persistence |
| Backend test files | 126 files, 87,720 lines | All use jest.mock — zero tests hit real DB/Redis |
| Frontend test files | 2 files | Need 95%+ coverage across 23 pages, 13 components, 3 hooks, 2 providers |
| .env management | .env.example exists | No .env.production.example, no secrets rotation docs |
| README | 1 line ("# marketing") | Needs real documentation |

---

## NON-NEGOTIABLE RULES (Enforced in every phase)

1. **NO fake data** — Every value must come from database queries, API responses, or user input
2. **NO hardcoded values** — All configuration via environment variables validated by Zod
3. **ALL API calls validated** — Request/response schemas enforced with Zod
4. **ALL tests use real assertions** — No `expect(true).toBe(true)` or trivial checks
5. **95%+ test coverage** — Measured by Jest (backend) and Vitest (frontend) coverage reporters
6. **Every UI component tested** — Render tests, interaction tests, error state tests
7. **Every backend service tested** — Unit tests with mocks AND integration tests with real DB
8. **No skipped tests** — Every `it()` block must contain meaningful assertions
9. **Modern UI** — Dark mode, theme customization, responsive design, accessibility (WCAG 2.1 AA)
10. **Real functioning application** — Can start, connect to DB, serve UI, handle requests end-to-end

---

## PHASE 11: MODERN CUSTOMIZABLE UI OVERHAUL

### 11A. Dark Mode Implementation
> Wire the existing `darkMode` state in AppContext to actual CSS theming

- [ ] Add dark mode color palette to `ui/src/index.css` under `@theme` using CSS custom properties (`--color-*` tokens for dark variants)
- [ ] Create `ui/src/hooks/useTheme.ts` hook that reads `darkMode` from AppContext and applies `dark` class to `<html>` element
- [ ] Update `ui/src/App.tsx` to wrap with theme hook, apply `dark` class conditionally
- [ ] Update every shared component (`Card`, `KPICard`, `DataTable`, `StatusBadge`, `ProgressBar`, `ConfidenceScore`, `PageHeader`, `EmptyState`, `LoadingSkeleton`, `ApiErrorDisplay`, `ErrorBoundary`) to support `dark:` Tailwind variants:
  - Backgrounds: `bg-white dark:bg-surface-800`
  - Text: `text-surface-900 dark:text-surface-100`
  - Borders: `border-surface-200 dark:border-surface-700`
  - Hover states: `hover:bg-surface-50 dark:hover:bg-surface-700`
- [ ] Update `Sidebar.tsx`: dark background, active state contrast, nav item hover
- [ ] Update `Header.tsx`: dark background, search input dark variant, icon colors
- [ ] Update all 23 page files to use dark-compatible classes (replace any raw color values with theme tokens)
- [ ] Add dark mode toggle button in `Header.tsx` using existing `toggleDarkMode` from AppContext (use `Sun`/`Moon` icons from lucide-react)
- [ ] Persist dark mode preference to localStorage and sync to backend via `PUT /api/v1/settings/appearance`
- [ ] Test: dark mode renders correctly on every page, no white-flash on load

### 11B. Theme Customization System
> Allow users to pick accent colors and density from Settings page

- [ ] Create `ui/src/hooks/useThemeCustomization.ts` — manages accent color (primary hue), border radius scale, and density (compact/normal/comfortable)
- [ ] Define 6 accent color presets in the hook: Blue (default), Purple, Green, Orange, Rose, Teal — each preset sets `--color-primary-*` CSS custom properties at runtime
- [ ] Add density control: compact (smaller padding/text), normal (current), comfortable (larger padding/text) — implemented via CSS class on `<html>` (`.density-compact`, `.density-comfortable`)
- [ ] Update `ui/src/pages/Settings.tsx` "Appearance" tab:
  - Color preset picker (6 swatches, click to select, visual preview)
  - Density radio buttons (compact / normal / comfortable)
  - Dark mode toggle (mirrors Header toggle)
  - Font size slider (14px–18px base)
  - Border radius slider (0px–16px)
- [ ] Persist all appearance settings to backend via `PUT /api/v1/settings/appearance` and to localStorage for instant load
- [ ] Load saved theme on app mount in `AppContext.tsx` (read from localStorage first, then hydrate from API)

### 11C. Responsive Design Audit
> Ensure every page works on mobile (320px), tablet (768px), desktop (1024px+)

- [ ] Audit `Sidebar.tsx`: collapsible on mobile with hamburger menu (already has `sidebarOpen` state), overlay on mobile, persistent on desktop
- [ ] Audit `Header.tsx`: stack search/actions on mobile, hide labels on small screens
- [ ] Audit all 23 pages: ensure grid layouts use responsive breakpoints (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`), tables scroll horizontally on mobile, charts resize
- [ ] Add `ui/src/hooks/useMediaQuery.ts` for programmatic breakpoint detection
- [ ] Test: every page renders without horizontal scroll at 320px, 768px, 1024px, 1440px

### 11D. Accessibility (WCAG 2.1 AA)
- [ ] Add `aria-label` to all icon-only buttons (Sidebar nav, Header actions)
- [ ] Add `role="navigation"` to Sidebar, `role="banner"` to Header, `role="main"` to content area
- [ ] Ensure all interactive elements are keyboard-focusable with visible focus rings (`focus-visible:ring-2 focus-visible:ring-primary-500`)
- [ ] Add `aria-live="polite"` to alert/notification containers
- [ ] Ensure color contrast ratio ≥ 4.5:1 for all text (both light and dark mode)
- [ ] Add skip-to-content link as first focusable element

### 11E. UI Polish
- [ ] Add smooth page transitions using CSS transitions on route change (opacity fade, 150ms)
- [ ] Add loading skeleton animations (pulse) matching the layout shape of each page
- [ ] Add toast notification component (`ui/src/components/shared/Toast.tsx`) for mutation feedback (success/error), positioned top-right, auto-dismiss after 5s
- [ ] Add confirmation dialog component (`ui/src/components/shared/ConfirmDialog.tsx`) for destructive actions (delete, kill switch activate)
- [ ] Add breadcrumb component for nested views
- [ ] Improve `ErrorBoundary` with "Try Again" button and styled error card

**Files to create:**
```
ui/src/hooks/useTheme.ts
ui/src/hooks/useThemeCustomization.ts
ui/src/hooks/useMediaQuery.ts
ui/src/components/shared/Toast.tsx
ui/src/components/shared/ConfirmDialog.tsx
ui/src/components/shared/Breadcrumb.tsx
```

**Files to modify:**
```
ui/src/index.css (dark mode + density + accent colors)
ui/src/App.tsx (theme provider, transitions)
ui/src/main.tsx (theme initialization)
ui/src/context/AppContext.tsx (theme persistence)
ui/src/components/layout/Sidebar.tsx (dark mode, mobile)
ui/src/components/layout/Header.tsx (dark mode, dark toggle)
ui/src/components/shared/*.tsx (all 11 shared components — dark variants)
ui/src/pages/*.tsx (all 23 pages — dark variants, responsive audit)
ui/src/pages/Settings.tsx (appearance tab overhaul)
```

---

## PHASE 12: BACKEND HARDENING & REAL INTEGRATION TESTS

### 12A. Environment & Configuration Hardening
- [ ] Make `ANTHROPIC_API_KEY` required in env schema OR add explicit graceful degradation mode:
  - If key is missing, set `env.AI_ENABLED = false`
  - All agent services check `env.AI_ENABLED` before calling Anthropic
  - Return structured error `{ error: 'AI_DISABLED', message: 'Anthropic API key not configured' }` instead of crashing
- [ ] Add `ANTHROPIC_API_KEY` presence check to health check endpoint (`/health`) — report `ai: { status: 'disabled' }` if missing
- [ ] Create `server/.env.production.example` with all production-required vars documented with placeholder values and comments
- [ ] Add `VITE_API_BASE` to `ui/.env.example` (value: `http://localhost:3001/api/v1`)
- [ ] Validate that `JWT_SECRET` is ≥ 32 characters in production mode (add Zod `.min(32)` refinement)
- [ ] Validate that `ENCRYPTION_KEY` is exactly 32 characters in production mode

### 12B. Database Test Infrastructure
> Set up a real PostgreSQL test database for integration tests

- [ ] Create `server/tests/setup/test-database.ts`:
  - Connects to PostgreSQL using `DATABASE_URL` from test env
  - Creates a test-specific schema (e.g., `test_<random>`) or uses a test database
  - Runs all migrations from `server/src/migrations/` against test DB
  - Exports `getTestPool()` and `cleanupTestDb()`
  - After all tests: drops test schema and closes pool
- [ ] Create `server/tests/setup/test-redis.ts`:
  - Connects to Redis using `REDIS_URL` from test env (or uses a different DB number)
  - Exports `getTestRedis()` and `cleanupTestRedis()`
  - Flushes test DB after all tests
- [ ] Create `server/tests/setup/global-setup.ts` — Jest globalSetup that initializes test DB + Redis
- [ ] Create `server/tests/setup/global-teardown.ts` — Jest globalTeardown that cleans up
- [ ] Update `server/jest.config.js`:
  - Add `globalSetup` and `globalTeardown` pointing to setup files
  - Add `projects` config to separate unit tests (mocked) from integration tests (real DB)
  - Set `coverageThreshold: { global: { branches: 95, functions: 95, lines: 95, statements: 95 } }`

### 12C. Real Integration Tests (Backend)
> Replace mocked integration tests with tests that hit real PostgreSQL and Redis

- [ ] `server/tests/integration/real/auth.real.test.ts`:
  - Register a user → verify row in `users` table
  - Login → verify JWT is valid and session created in DB
  - Access protected route → verify token validation
  - Logout → verify session deleted
  - Password reset flow → verify token generated and consumed
  - MFA setup and verification flow
  - Minimum 25 test cases
- [ ] `server/tests/integration/real/campaigns.real.test.ts`:
  - CRUD lifecycle: create → read → update → delete
  - Verify all DB constraints (required fields, foreign keys)
  - Test pagination, filtering, sorting
  - Test campaign status transitions (draft → active → paused → completed)
  - Test budget validation (cannot exceed allocation)
  - Minimum 30 test cases
- [ ] `server/tests/integration/real/countries.real.test.ts`:
  - CRUD lifecycle with real DB
  - Opportunity scoring calculation verification
  - Country-campaign relationship integrity
  - Minimum 20 test cases
- [ ] `server/tests/integration/real/content.real.test.ts`:
  - Content creation with all types (blog, social, translation)
  - Publishing workflow (draft → review → published)
  - Content-country association
  - Minimum 20 test cases
- [ ] `server/tests/integration/real/budget.real.test.ts`:
  - Budget allocation CRUD
  - Spending tracking and validation
  - Over-budget prevention
  - Reallocation workflows
  - Minimum 20 test cases
- [ ] `server/tests/integration/real/killswitch.real.test.ts`:
  - Activate/deactivate at all 4 levels
  - Verify campaign state changes when kill switch activates
  - Automated trigger creation and firing
  - Recovery after deactivation
  - Minimum 25 test cases
- [ ] `server/tests/integration/real/agents.real.test.ts`:
  - Agent state persistence to DB
  - Agent decision logging
  - Cross-challenge protocol execution (with mocked AI but real DB)
  - Orchestrator aggregation
  - Minimum 30 test cases
- [ ] `server/tests/integration/real/integrations.real.test.ts`:
  - Google Ads service DB operations
  - Meta Ads service DB operations
  - Shopify service DB operations
  - CRM service DB operations
  - Minimum 25 test cases
- [ ] `server/tests/integration/real/dashboard.real.test.ts`:
  - Dashboard overview aggregation with seeded data
  - Verify all 14 parallel queries return correct shape
  - Redis caching behavior (first call misses, second hits)
  - Minimum 15 test cases
- [ ] `server/tests/integration/real/final-outputs.real.test.ts`:
  - All 10 final output services generate valid output from DB data
  - Country ranking with real scoring
  - Strategy generation per country
  - Budget model calculation
  - Minimum 30 test cases
- [ ] `server/tests/integration/real/notifications.real.test.ts`:
  - Notification creation and delivery tracking
  - Multi-channel routing (email, slack, in-app, sms)
  - User preference filtering
  - Minimum 15 test cases
- [ ] `server/tests/integration/real/webhooks.real.test.ts`:
  - Webhook registration and storage
  - HMAC verification
  - Event processing and DB persistence
  - Minimum 15 test cases
- [ ] `server/tests/integration/real/queue.real.test.ts`:
  - Job enqueue and dequeue with Redis
  - Worker processing
  - Retry logic
  - Dead letter queue
  - Minimum 15 test cases

### 12D. Seed Data for Tests
- [ ] Create `server/tests/setup/seed-test-data.ts`:
  - Insert a minimal but complete dataset: 3 users (admin, analyst, viewer), 5 countries, 10 campaigns, 5 creatives, 5 content items, 3 products, budget allocations, agent states
  - All data must be realistic (real country names, real campaign structures, real budget numbers)
  - Export seed data objects for assertion comparisons in tests
  - Provide cleanup function to truncate all tables

### 12E. Backend Coverage Target
- [ ] After all integration tests, run `npm test -- --coverage` and verify:
  - `src/services/**` ≥ 95% line coverage
  - `src/controllers/**` ≥ 95% line coverage
  - `src/middleware/**` ≥ 95% line coverage
  - `src/agents/**` ≥ 95% line coverage
  - `src/config/**` ≥ 95% line coverage
  - Overall ≥ 95% line coverage

**Files to create:**
```
server/tests/setup/test-database.ts
server/tests/setup/test-redis.ts
server/tests/setup/global-setup.ts
server/tests/setup/global-teardown.ts
server/tests/setup/seed-test-data.ts
server/tests/integration/real/auth.real.test.ts
server/tests/integration/real/campaigns.real.test.ts
server/tests/integration/real/countries.real.test.ts
server/tests/integration/real/content.real.test.ts
server/tests/integration/real/budget.real.test.ts
server/tests/integration/real/killswitch.real.test.ts
server/tests/integration/real/agents.real.test.ts
server/tests/integration/real/integrations.real.test.ts
server/tests/integration/real/dashboard.real.test.ts
server/tests/integration/real/final-outputs.real.test.ts
server/tests/integration/real/notifications.real.test.ts
server/tests/integration/real/webhooks.real.test.ts
server/tests/integration/real/queue.real.test.ts
server/.env.production.example
```

**Files to modify:**
```
server/src/config/env.ts (AI_ENABLED flag, JWT_SECRET min length, ENCRYPTION_KEY length)
server/jest.config.js (coverage thresholds, projects, globalSetup)
server/src/services/healthcheck/HealthCheckService.ts (AI status reporting)
```

---

## PHASE 13: FRONTEND TEST SUITE (95%+ COVERAGE)

### 13A. Test Infrastructure Setup
- [ ] Install frontend testing dependencies:
  ```
  npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
  npm install -D jsdom @vitest/coverage-v8 msw
  ```
- [ ] Create `ui/vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config'
  import react from '@vitejs/plugin-react'

  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
        thresholds: {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },
    },
  })
  ```
- [ ] Create `ui/tests/setup.ts`:
  - Import `@testing-library/jest-dom/vitest`
  - Set up MSW (Mock Service Worker) for API mocking
  - Configure global fetch mock
  - Set up `ResizeObserver` mock (for Recharts)
  - Set up `matchMedia` mock (for responsive hooks)
  - Set up `IntersectionObserver` mock
- [ ] Create `ui/tests/mocks/handlers.ts` — MSW request handlers for all API endpoints used by the app:
  - `GET /api/v1/dashboard/overview` → mock dashboard data
  - `GET /api/v1/campaigns` → mock campaign list
  - `GET /api/v1/countries` → mock country list
  - `GET /api/v1/killswitch/status` → mock kill switch state
  - `GET /api/v1/alerts` → mock alerts
  - `GET /api/v1/settings` → mock settings
  - All other endpoints used by pages (every endpoint must return realistic data shapes matching the TypeScript types)
- [ ] Create `ui/tests/mocks/server.ts` — MSW server setup
- [ ] Create `ui/tests/utils/render.tsx` — custom render function that wraps components with all necessary providers (BrowserRouter, QueryProvider, AppProvider)
- [ ] Add test scripts to `ui/package.json`:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
  ```

### 13B. Shared Component Tests (13 components)
> Every component tested for: rendering, props, interactions, dark mode, error states

- [ ] `ui/tests/components/shared/Card.test.tsx` — renders title, subtitle, children, actions slot, dark mode class
- [ ] `ui/tests/components/shared/KPICard.test.tsx` — renders value with prefix/suffix, trend up/down/neutral icons and colors, number formatting
- [ ] `ui/tests/components/shared/DataTable.test.tsx` — renders columns and rows, custom cell rendering, empty state, dark mode
- [ ] `ui/tests/components/shared/StatusBadge.test.tsx` — renders all status variants (active, paused, draft, completed, error), correct colors
- [ ] `ui/tests/components/shared/ProgressBar.test.tsx` — renders percentage, color variants, zero/100 edge cases
- [ ] `ui/tests/components/shared/ConfidenceScore.test.tsx` — renders circular score, 0/50/100 values, color thresholds
- [ ] `ui/tests/components/shared/PageHeader.test.tsx` — renders title, icon, description, action buttons
- [ ] `ui/tests/components/shared/EmptyState.test.tsx` — renders message, icon, action button
- [ ] `ui/tests/components/shared/LoadingSkeleton.test.tsx` — renders all skeleton variants (KPI, table, chart, card, page)
- [ ] `ui/tests/components/shared/ApiErrorDisplay.test.tsx` — renders error message, retry button, calls refetch on click
- [ ] `ui/tests/components/shared/ErrorBoundary.test.tsx` — catches rendering errors, displays fallback UI, "Try Again" resets
- [ ] `ui/tests/components/shared/Toast.test.tsx` — renders success/error/info variants, auto-dismisses, manual close
- [ ] `ui/tests/components/shared/ConfirmDialog.test.tsx` — renders title/message, confirm/cancel buttons, calls callbacks
- Each test file: minimum 8 test cases covering render, props, interactions, edge cases

### 13C. Layout Component Tests
- [ ] `ui/tests/components/layout/Sidebar.test.tsx`:
  - Renders all 23 navigation items
  - Active state highlights correct item based on current route
  - Mobile: toggles open/closed via hamburger
  - Dark mode: applies dark classes
  - Keyboard navigation works
  - Minimum 12 test cases
- [ ] `ui/tests/components/layout/Header.test.tsx`:
  - Renders search input, autonomy mode selector, alerts badge, user menu
  - Dark mode toggle clicks and updates context
  - Alert count shows correct unread number
  - Autonomy mode switch updates context
  - Minimum 10 test cases

### 13D. Hook Tests
- [ ] `ui/tests/hooks/useApi.test.ts` (expand existing):
  - `useApiQuery`: fetch on mount, caching, stale time, refetch, error handling, disabled state, polling interval, params serialization
  - `useApiMutation`: POST/PUT/DELETE, cache invalidation, onSuccess/onError callbacks, loading state, reset
  - Minimum 25 test cases total
- [ ] `ui/tests/hooks/useWebSocket.test.ts`:
  - Connects to WebSocket URL
  - Subscribes to channels
  - Receives and dispatches messages
  - Auto-reconnect on disconnect
  - Cleanup on unmount
  - Minimum 10 test cases
- [ ] `ui/tests/hooks/useTheme.test.ts`:
  - Applies dark class to html element
  - Reads from localStorage
  - Syncs with AppContext
  - Minimum 6 test cases
- [ ] `ui/tests/hooks/useThemeCustomization.test.ts`:
  - Applies accent color CSS variables
  - Applies density class
  - Persists to localStorage
  - Minimum 8 test cases
- [ ] `ui/tests/hooks/useMediaQuery.test.ts`:
  - Returns correct boolean for matching query
  - Updates on resize
  - Minimum 4 test cases

### 13E. Provider/Context Tests
- [ ] `ui/tests/providers/QueryProvider.test.tsx`:
  - Cache set/get with stale time
  - Cache invalidation by key and prefix
  - Request deduplication (same key only fetches once)
  - Clear all cache
  - Minimum 10 test cases
- [ ] `ui/tests/context/AppContext.test.tsx`:
  - Initial state values
  - toggleSidebar flips state
  - toggleDarkMode flips state
  - setKillSwitch updates and syncs to API
  - addAlert/dismissAlert manages alert list
  - setAutonomyMode updates mode
  - setSelectedCountry updates selection
  - Minimum 12 test cases

### 13F. Page Tests (All 23 Pages)
> Every page tested for: initial render with loading state, data loaded state, error state, user interactions, dark mode rendering

- [ ] `ui/tests/pages/Dashboard.test.tsx` — KPIs render from API, agent grid shows status, charts render, alerts list, WebSocket updates, 15+ tests
- [ ] `ui/tests/pages/MarketIntelligence.test.tsx` — country table renders, scatter chart, "Run Analysis" button triggers API, filters work, 12+ tests
- [ ] `ui/tests/pages/CountryStrategy.test.tsx` — country selector, strategy display, platform mix chart, timeline, 10+ tests
- [ ] `ui/tests/pages/PaidAds.test.tsx` — campaign table renders, create campaign modal, platform tabs, performance charts, filters, 15+ tests
- [ ] `ui/tests/pages/OrganicSocial.test.tsx` — post calendar, create post modal, AI optimize button, scheduling, 10+ tests
- [ ] `ui/tests/pages/ContentBlog.test.tsx` — content list, SEO scoring display, AI generate button, publish to Shopify, 12+ tests
- [ ] `ui/tests/pages/CreativeStudio.test.tsx` — creative gallery, AI generation panel, fatigue alerts, 10+ tests
- [ ] `ui/tests/pages/Analytics.test.tsx` — KPI cards (CAC/LTV/ROAS/MER), funnel chart, attribution model selector, 12+ tests
- [ ] `ui/tests/pages/BudgetOptimizer.test.tsx` — allocation table, "Optimize" button, risk guardrails, apply recommendations, 12+ tests
- [ ] `ui/tests/pages/ABTesting.test.tsx` — test list, create test, confidence scoring display, variant comparison, 10+ tests
- [ ] `ui/tests/pages/Conversion.test.tsx` — funnel visualization, UX recommendations, "Run Optimization" button, 10+ tests
- [ ] `ui/tests/pages/Shopify.test.tsx` — product list, sync status, "Sync Now" button, webhook status, 10+ tests
- [ ] `ui/tests/pages/Localization.test.tsx` — translation table, language selector, "Translate" button, currency pairs, 10+ tests
- [ ] `ui/tests/pages/Compliance.test.tsx` — regulation list, "Run Audit" button, GDPR/CCPA status, flagged campaigns, 10+ tests
- [ ] `ui/tests/pages/CompetitiveIntel.test.tsx` — competitor table, trend detection, gap analysis chart, 10+ tests
- [ ] `ui/tests/pages/FraudDetection.test.tsx` — alert list, resolve/block buttons, rule toggles, anomaly chart, 10+ tests
- [ ] `ui/tests/pages/BrandConsistency.test.tsx` — consistency checks list, radar chart, "Run Analysis" button, 10+ tests
- [ ] `ui/tests/pages/DataEngineering.test.tsx` — pipeline table, data quality metrics, error logs, 10+ tests
- [ ] `ui/tests/pages/Security.test.tsx` — security events, API key management, audit log, key rotation button, 12+ tests
- [ ] `ui/tests/pages/RevenueForecast.test.tsx` — 3 scenario cards, LTV/CAC chart, break-even analysis, projection controls, 10+ tests
- [ ] `ui/tests/pages/Orchestrator.test.tsx` — agent grid (20 agents), decision matrix, cross-challenge results, WebSocket live updates, 12+ tests
- [ ] `ui/tests/pages/KillSwitch.test.tsx` — switch controls for all 4 levels, confirmation dialog, automated trigger toggles, status indicators, 12+ tests
- [ ] `ui/tests/pages/Settings.test.tsx` — 6 tabs (General, API Keys, AI Config, Notifications, Appearance, Security), save mutations, appearance customization, 15+ tests

### 13G. API Service Tests
- [ ] `ui/tests/services/api.test.ts`:
  - GET/POST/PUT/PATCH/DELETE methods
  - Authorization header set when API key exists
  - Error thrown on non-OK response
  - Base URL from environment variable
  - Minimum 10 test cases

### 13H. Frontend Coverage Target
- [ ] After all tests, run `npm run test:coverage` and verify:
  - `src/components/**` ≥ 95% line coverage
  - `src/pages/**` ≥ 95% line coverage
  - `src/hooks/**` ≥ 95% line coverage
  - `src/context/**` ≥ 95% line coverage
  - `src/providers/**` ≥ 95% line coverage
  - `src/services/**` ≥ 95% line coverage
  - Overall ≥ 95% line coverage

**Files to create:**
```
ui/vitest.config.ts
ui/tests/setup.ts
ui/tests/mocks/handlers.ts
ui/tests/mocks/server.ts
ui/tests/utils/render.tsx
ui/tests/components/shared/Card.test.tsx
ui/tests/components/shared/KPICard.test.tsx
ui/tests/components/shared/DataTable.test.tsx
ui/tests/components/shared/StatusBadge.test.tsx
ui/tests/components/shared/ProgressBar.test.tsx
ui/tests/components/shared/ConfidenceScore.test.tsx
ui/tests/components/shared/PageHeader.test.tsx
ui/tests/components/shared/EmptyState.test.tsx
ui/tests/components/shared/LoadingSkeleton.test.tsx
ui/tests/components/shared/ApiErrorDisplay.test.tsx
ui/tests/components/shared/ErrorBoundary.test.tsx
ui/tests/components/shared/Toast.test.tsx
ui/tests/components/shared/ConfirmDialog.test.tsx
ui/tests/components/layout/Sidebar.test.tsx
ui/tests/components/layout/Header.test.tsx
ui/tests/hooks/useApi.test.ts (expand existing)
ui/tests/hooks/useWebSocket.test.ts
ui/tests/hooks/useTheme.test.ts
ui/tests/hooks/useThemeCustomization.test.ts
ui/tests/hooks/useMediaQuery.test.ts
ui/tests/providers/QueryProvider.test.tsx
ui/tests/context/AppContext.test.tsx
ui/tests/pages/Dashboard.test.tsx
ui/tests/pages/MarketIntelligence.test.tsx
ui/tests/pages/CountryStrategy.test.tsx
ui/tests/pages/PaidAds.test.tsx
ui/tests/pages/OrganicSocial.test.tsx
ui/tests/pages/ContentBlog.test.tsx
ui/tests/pages/CreativeStudio.test.tsx
ui/tests/pages/Analytics.test.tsx
ui/tests/pages/BudgetOptimizer.test.tsx
ui/tests/pages/ABTesting.test.tsx
ui/tests/pages/Conversion.test.tsx
ui/tests/pages/Shopify.test.tsx
ui/tests/pages/Localization.test.tsx
ui/tests/pages/Compliance.test.tsx
ui/tests/pages/CompetitiveIntel.test.tsx
ui/tests/pages/FraudDetection.test.tsx
ui/tests/pages/BrandConsistency.test.tsx
ui/tests/pages/DataEngineering.test.tsx
ui/tests/pages/Security.test.tsx
ui/tests/pages/RevenueForecast.test.tsx
ui/tests/pages/Orchestrator.test.tsx
ui/tests/pages/KillSwitch.test.tsx
ui/tests/pages/Settings.test.tsx
ui/tests/services/api.test.ts
```

---

## PHASE 14: DOCKER, CI/CD & DEPLOYMENT

### 14A. Docker Setup
- [ ] Create `server/Dockerfile` (multi-stage build):
  - Stage 1 (`builder`): `node:20-alpine`, install deps, compile TypeScript
  - Stage 2 (`runner`): `node:20-alpine`, copy only `dist/`, `node_modules/` (production), `package.json`
  - Run as non-root user (`node`)
  - Expose port 3001
  - Health check: `CMD ["node", "-e", "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1))"]`
  - Entry: `CMD ["node", "dist/index.js"]`
- [ ] Create `ui/Dockerfile` (multi-stage build):
  - Stage 1 (`builder`): `node:20-alpine`, install deps, run `npm run build`
  - Stage 2 (`runner`): `nginx:alpine`, copy `dist/` to `/usr/share/nginx/html/`
  - Copy custom `ui/nginx.conf` for SPA routing (all routes → index.html) and API proxy to backend
  - Expose port 80
  - Health check: `CMD ["curl", "-f", "http://localhost/"]`
- [ ] Create `ui/nginx.conf`:
  - Serve static files with aggressive caching (1 year for hashed assets)
  - SPA fallback: `try_files $uri $uri/ /index.html`
  - Proxy `/api/` to backend service
  - Gzip compression enabled
  - Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] Create `docker-compose.yml` (root level):
  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      environment:
        POSTGRES_DB: ai_growth_engine
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      ports: ["5432:5432"]
      volumes: [postgres_data:/var/lib/postgresql/data]
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U postgres"]
        interval: 5s
        timeout: 3s
        retries: 5

    redis:
      image: redis:7-alpine
      ports: ["6379:6379"]
      volumes: [redis_data:/data]
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 5s
        timeout: 3s
        retries: 5

    server:
      build: ./server
      depends_on:
        postgres: { condition: service_healthy }
        redis: { condition: service_healthy }
      environment:
        NODE_ENV: production
        DATABASE_URL: postgresql://postgres:${DB_PASSWORD:-postgres}@postgres:5432/ai_growth_engine
        REDIS_URL: redis://redis:6379
        JWT_SECRET: ${JWT_SECRET}
        ENCRYPTION_KEY: ${ENCRYPTION_KEY}
        ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ports: ["3001:3001"]

    ui:
      build: ./ui
      depends_on: [server]
      ports: ["80:80"]

  volumes:
    postgres_data:
    redis_data:
  ```
- [ ] Create `docker-compose.dev.yml` for local development (with volume mounts, hot reload)
- [ ] Create `.dockerignore` files for server/ and ui/ (exclude node_modules, .git, tests, coverage)
- [ ] Create `server/.dockerignore`
- [ ] Create `ui/.dockerignore`

### 14B. CI/CD Pipeline Update
- [ ] Update `server/ci/pipeline.yml` (or create `.github/workflows/ci.yml` at repo root):
  - **Stage 1: Lint** — ESLint on server and UI
  - **Stage 2: Type Check** — `tsc --noEmit` on server and UI
  - **Stage 3: Unit Tests** — Server unit tests + UI unit tests (parallel)
  - **Stage 4: Integration Tests** — Server integration tests with PostgreSQL and Redis services
  - **Stage 5: Build** — Server `npm run build` + UI `npm run build`
  - **Stage 6: Coverage** — Upload coverage reports, fail if below 95%
  - **Stage 7: Docker Build** — Build and tag images
  - Use GitHub Actions services for PostgreSQL 16 and Redis 7
  - Cache node_modules between runs
  - Run on push to `main` and all PRs

### 14C. Production Documentation
- [ ] Rewrite `README.md` (root level):
  - Project overview (what the app does)
  - Architecture diagram (ASCII: UI → API → DB/Redis/Anthropic)
  - Quick start with docker-compose
  - Development setup (without Docker)
  - Environment variables table (reference .env.example)
  - Test commands
  - Deployment guide (reference DEPLOYMENT.md)
- [ ] Update `server/DEPLOYMENT.md`:
  - Add Docker deployment instructions
  - Add docker-compose production deployment
  - Add database backup/restore with `pg_dump`/`pg_restore`
  - Add secrets management recommendations (env vars, not files)
  - Add SSL/TLS setup with Let's Encrypt

**Files to create:**
```
server/Dockerfile
server/.dockerignore
ui/Dockerfile
ui/.dockerignore
ui/nginx.conf
docker-compose.yml
docker-compose.dev.yml
.github/workflows/ci.yml
```

**Files to modify:**
```
README.md (complete rewrite)
server/DEPLOYMENT.md (add Docker sections)
server/ci/pipeline.yml (update stages)
```

---

## PHASE 15: FULL SYSTEM DEBUGGING & VALIDATION

### 15A. TypeScript Compilation Verification
- [ ] Run `cd server && npx tsc --noEmit` — fix ALL type errors to zero
- [ ] Run `cd ui && npx tsc -b --noEmit` — fix ALL type errors to zero
- [ ] Verify no `any` types in production code (allow in tests only): `grep -r ": any" server/src/ --include="*.ts" | wc -l` should be 0 or near-zero
- [ ] Verify no `@ts-ignore` or `@ts-expect-error` in production code

### 15B. Lint Verification
- [ ] Run `cd server && npm run lint` — fix all ESLint errors
- [ ] Run `cd ui && npm run lint` — fix all ESLint errors
- [ ] Ensure no `console.log` in production code (only `logger.*` calls in server, no console in UI except error boundaries)

### 15C. Backend Test Suite Execution
- [ ] Run `cd server && npm test` — ALL tests must pass (0 failures)
- [ ] Run `cd server && npm test -- --coverage` — verify 95%+ on all categories:
  - Statements ≥ 95%
  - Branches ≥ 95%
  - Functions ≥ 95%
  - Lines ≥ 95%
- [ ] Fix any failing tests — debug root cause, not just suppress
- [ ] Verify no flaky tests — run test suite 3 times, all must pass consistently

### 15D. Frontend Test Suite Execution
- [ ] Run `cd ui && npm test` — ALL tests must pass (0 failures)
- [ ] Run `cd ui && npm run test:coverage` — verify 95%+ on all categories:
  - Statements ≥ 95%
  - Branches ≥ 95%
  - Functions ≥ 95%
  - Lines ≥ 95%
- [ ] Fix any failing tests — debug root cause
- [ ] Verify no flaky tests — run test suite 3 times

### 15E. Build Verification
- [ ] Run `cd server && npm run build` — clean compile to dist/, zero errors
- [ ] Run `cd ui && npm run build` — clean compile to dist/, zero warnings treated as errors
- [ ] Verify `ui/dist/` contains:
  - `index.html` with hashed asset references
  - `assets/` with JS chunks (one per lazy-loaded page) and CSS bundle
  - All 23 page chunks present
- [ ] Verify `server/dist/` contains compiled JS for all source files

### 15F. Docker Build Verification
- [ ] Run `docker-compose build` — both server and UI images build successfully
- [ ] Run `docker-compose up -d` — all services start and pass health checks
- [ ] Verify `curl http://localhost/health` returns `{ status: "ok" }` from backend
- [ ] Verify `curl http://localhost/` returns the UI index.html
- [ ] Verify `curl http://localhost/api/v1/auth/login` returns proper error (not 404)
- [ ] Run `docker-compose down` — clean shutdown

### 15G. End-to-End Smoke Test (Manual Verification Checklist)
> Run the full stack and verify these flows work:

- [ ] **Auth flow**: Register → Login → Get JWT → Access dashboard → Logout
- [ ] **Campaign CRUD**: Create campaign → Edit → Pause → Resume → Delete
- [ ] **Dashboard**: KPIs load, charts render, agent grid shows, alerts display
- [ ] **Dark mode**: Toggle dark mode → all pages render correctly, no white elements
- [ ] **Theme**: Change accent color in Settings → verify color changes across app
- [ ] **Kill switch**: Activate Level 1 → verify UI updates → Deactivate → verify recovery
- [ ] **Settings**: Change and save settings → reload → settings persist
- [ ] **Mobile**: Resize to 375px → sidebar collapses → pages remain usable
- [ ] **Error handling**: Disconnect backend → verify error states appear → reconnect → verify recovery

### 15H. Performance Verification
- [ ] UI Lighthouse score ≥ 90 (Performance, Accessibility, Best Practices, SEO)
- [ ] Initial page load bundle size ≤ 300KB (gzipped)
- [ ] API response times ≤ 200ms for all CRUD endpoints (with seeded data)
- [ ] No memory leaks in 10-minute continuous operation (check Node.js heap)

### 15I. Security Verification
- [ ] No hardcoded secrets in any committed file: `grep -r "password\|secret\|key.*=" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v test | grep -v .env` — review every match
- [ ] JWT tokens cannot be used after logout (session invalidation works)
- [ ] RBAC enforced: viewer cannot access admin endpoints
- [ ] Rate limiting active: 101st request in 15 minutes returns 429
- [ ] CORS only allows configured origins
- [ ] Helmet headers present in all responses
- [ ] SQL injection impossible: all queries use parameterized statements

### 15J. Final Cleanup
- [ ] Remove all `TODO` and `FIXME` comments from production code (or resolve them)
- [ ] Remove any commented-out code blocks
- [ ] Ensure all imports are used (no dead imports)
- [ ] Verify `.gitignore` excludes: `node_modules/`, `dist/`, `.env`, `coverage/`, `.DS_Store`
- [ ] Verify no large binary files committed
- [ ] Final `git status` is clean after build

---

## PHASE SUMMARY

| Phase | Description | Key Deliverables |
|-------|-------------|-----------------|
| Phase 11 | Modern Customizable UI | Dark mode, theme customization, responsive design, accessibility, UI polish |
| Phase 12 | Backend Hardening & Real Integration Tests | Env hardening, test DB infrastructure, 13 real integration test suites, 95%+ backend coverage |
| Phase 13 | Frontend Test Suite | Vitest + RTL setup, 23 page tests, 15 component tests, 6 hook tests, 2 provider tests, 95%+ frontend coverage |
| Phase 14 | Docker, CI/CD & Deployment | Dockerfiles, docker-compose, CI pipeline, production docs |
| Phase 15 | Full System Debugging & Validation | TypeScript zero errors, lint clean, all tests pass, 95%+ coverage both sides, Docker verified, E2E smoke test, security audit, performance check, final cleanup |

---

## EXECUTION ORDER

```
Phase 11 (UI Overhaul)
  └─> Phase 12 (Backend Tests) — can run in parallel with Phase 11
       └─> Phase 13 (Frontend Tests) — depends on Phase 11 UI changes
            └─> Phase 14 (Docker/CI) — depends on both test phases
                 └─> Phase 15 (Debug & Validate) — final pass, depends on everything
```

Phases 11 and 12 are independent and CAN be executed in parallel.
Phase 13 depends on Phase 11 (tests must cover new UI components).
Phase 14 depends on 12 and 13 (CI must run all tests).
Phase 15 is the final validation pass after everything is in place.

---

## FILE INVENTORY (New Files)

### Phase 11: ~9 new files, ~30 modified files
### Phase 12: ~16 new files, ~3 modified files
### Phase 13: ~48 new files, ~2 modified files
### Phase 14: ~8 new files, ~3 modified files
### Phase 15: 0 new files, bug fixes only

**Total: ~81 new files, ~38 modified files**

---

## SUCCESS CRITERIA

The application is 100% production-ready when ALL of the following are true:

1. `cd server && npm test -- --coverage` → 95%+ all categories, 0 failures
2. `cd ui && npm run test:coverage` → 95%+ all categories, 0 failures
3. `cd server && npx tsc --noEmit` → 0 errors
4. `cd ui && npx tsc -b --noEmit` → 0 errors
5. `docker-compose up -d` → all services healthy
6. Dark mode works on every page
7. Theme customization persists across sessions
8. All 23 pages load data from real API endpoints
9. No hardcoded data in any production file
10. No fake/placeholder values anywhere
11. Kill switch halts and resumes system correctly
12. Auth flow works end-to-end (register → login → use → logout)
13. Mobile responsive at 320px on all pages
14. Lighthouse score ≥ 90 on all categories
15. Security checklist passes (no secrets in code, RBAC enforced, rate limiting active)
