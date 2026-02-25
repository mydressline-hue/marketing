# AI International Growth Engine - Build Progress

## Master Build Tracker
> **Reference Spec:** `ai_international_growth_engine.md`
> **Non-Negotiable Rules:** No fake data, no hardcoded values, API calls validated, all modules tested 3x, full UI-backend integration, Anthropic API keys configured for Opus + Sonnet agents.

---

## PHASE 1: UI FRONTEND (COMPLETED)
> React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts + Lucide Icons

### 1A. Project Scaffold & Core Infrastructure
- [x] Vite + React + TypeScript project setup
- [x] Tailwind CSS 4 configuration with custom theme
- [x] React Router with lazy-loaded routes (23 routes)
- [x] Global state management (AppContext)
- [x] API service layer (pre-wired for backend)
- [x] TypeScript type definitions for all entities

### 1B. Shared Component Library
- [x] KPICard - metric display with trend indicators
- [x] StatusBadge - dynamic status pills
- [x] DataTable - generic sortable table
- [x] ProgressBar - multi-color progress indicators
- [x] ConfidenceScore - circular score display (0-100)
- [x] Card - container with header/actions
- [x] PageHeader - page title with icon and actions

### 1C. Layout
- [x] Sidebar - 23-item navigation with active states
- [x] Header - search, autonomy mode toggle, alerts, user

### 1D. All 23 Pages (20 Agent Modules + 3 Control Pages)
- [x] Dashboard (Command Center) - KPIs, charts, agent grid, alerts
- [x] Market Intelligence - country ranking, scatter/radar charts, 12 countries
- [x] Country Strategy - per-country blueprints, platform mix, timelines
- [x] Paid Ads Architecture - campaign table, 5 platforms, performance charts
- [x] Organic Social Automation - calendar, scheduling, tone adaptation
- [x] Content & Blog Engine - SEO scoring, keywords, Shopify publishing
- [x] Creative Studio - AI generation panel, gallery, fatigue alerts
- [x] Performance Analytics - CAC/LTV/ROAS/MER, funnel, attribution
- [x] Budget Optimizer - allocation, risk guardrails, reallocation AI
- [x] A/B Testing Engine - confidence scoring, variant comparison
- [x] Conversion Optimization - funnel analysis, UX recommendations
- [x] Shopify Integration - product sync, pixel tracking, webhooks
- [x] Localization - 8 languages, cultural adaptation, currency pairs
- [x] Compliance & Regulatory - GDPR/CCPA, 10 regulations tracked
- [x] Competitive Intelligence - competitor monitoring, gap analysis
- [x] Fraud Detection - click fraud, bot traffic, anomaly rules
- [x] Brand Consistency - tone/visual compliance, radar chart
- [x] Data Engineering - pipeline monitoring, data quality metrics
- [x] Enterprise Security - API keys, RBAC, SOC2, audit logs
- [x] Revenue Forecasting - 3 scenarios, LTV/CAC, break-even
- [x] Master Orchestrator - 20 agents, cross-challenge, decision matrix
- [x] Kill Switch - multi-level controls, automated triggers, country toggles
- [x] Settings - API keys (Opus+Sonnet), AI config, notifications, appearance

### 1E. Build Verification
- [x] TypeScript compilation - zero errors
- [x] Vite production build - all 23 pages code-split successfully
- [x] Committed and pushed to remote branch

---

## PHASE 2: BACKEND FOUNDATION & DATABASE
> Node.js/Express API server, PostgreSQL, Redis, authentication, core infrastructure

### 2A. Project Setup
- [ ] Node.js + Express + TypeScript backend project
- [ ] Project structure: routes, controllers, services, models, middleware, utils
- [ ] Environment variable management (dotenv, no hardcoded values)
- [ ] CORS, helmet, rate limiting middleware
- [ ] Error handling middleware with structured error responses
- [ ] Request validation middleware (Zod/Joi schemas)
- [ ] Logging framework (Winston/Pino with structured JSON logs)

### 2B. Database Layer
- [ ] PostgreSQL schema design and migrations
- [ ] Tables: countries, campaigns, creatives, content, products, translations, compliance_rules, competitors, fraud_alerts, ab_tests, budget_allocations, audit_logs, users, roles, api_keys, agent_states, agent_decisions, kill_switch_state
- [ ] Database connection pool with retry logic
- [ ] Seed scripts with real-world reference data (country data, regulations, platform configs)
- [ ] Redis setup for caching, session management, and job queues

### 2C. Authentication & Authorization
- [ ] User authentication (JWT tokens)
- [ ] Role-based access control (Admin, Analyst, Campaign Manager, Viewer)
- [ ] Role-permission matrix enforcement
- [ ] API key management (encrypted storage, rotation support)
- [ ] MFA support for admin accounts
- [ ] Session management with Redis
- [ ] Audit log for all auth events

### 2D. Core API Endpoints (CRUD)
- [ ] Countries API - CRUD + opportunity scoring
- [ ] Campaigns API - CRUD + status management
- [ ] Creatives API - CRUD + performance tracking
- [ ] Content API - CRUD + publishing workflow
- [ ] Products API - CRUD + inventory management
- [ ] Budget API - allocation + spending tracking
- [ ] Alerts API - CRUD + acknowledgment
- [ ] Settings API - system configuration

### 2E. Testing (3x per module - spec requirement)
- [ ] Unit tests for all models and services
- [ ] Integration tests for all API endpoints
- [ ] End-to-end tests for critical workflows

---

## PHASE 3: AI AGENT SYSTEM (OPUS + SONNET)
> Core AI agent architecture with Anthropic API integration

### 3A. Agent Framework
- [ ] Base Agent class with standard interface (input, process, output, confidence)
- [ ] Agent registry and lifecycle management
- [ ] Agent state persistence (PostgreSQL)
- [ ] Agent decision logging (explainable AI requirement)
- [ ] Confidence scoring system (0-100 for every decision)
- [ ] Uncertainty flagging (agents must flag gaps, never guess)
- [ ] Structured output format for all agents

### 3B. Anthropic API Integration
- [ ] Anthropic SDK integration (secure key from vault)
- [ ] Opus client (primary agent - orchestration, strategy, decisions)
- [ ] Sonnet client (sub-agent - content generation, auxiliary ops)
- [ ] Rate limiting and token management
- [ ] Retry logic with exponential backoff
- [ ] Response validation and error handling
- [ ] Cost tracking per agent call

### 3C. Cross-Challenge Protocol (Spec Section 3)
- [ ] Challenge routing (each agent challenges at least 3 others)
- [ ] Inconsistency detection engine
- [ ] Confidence score comparison logic
- [ ] Data-backed justification requirement enforcement
- [ ] Gap reporting system
- [ ] Contradiction resolution (auto by confidence or manual review)
- [ ] Cross-challenge cycle execution and logging

### 3D. Master Orchestrator Agent (#20)
- [ ] Aggregate outputs from all 19 agents
- [ ] Detect contradictions across agent recommendations
- [ ] Force cross-challenge cycles
- [ ] Produce final decision matrix
- [ ] Assign final marketing actions
- [ ] Explainable decision logs for all orchestrated outputs

### 3E. Testing (3x per module)
- [ ] Unit tests for agent framework
- [ ] Integration tests for Anthropic API calls
- [ ] End-to-end tests for cross-challenge protocol

---

## PHASE 4: 20 AGENT MODULES (BACKEND LOGIC)
> Functional backend for each of the 20 agents per spec Section 2

### 4A. Market & Strategy Agents (Agents 1-2)
- [ ] Agent 1: Global Market Intelligence - GDP, internet penetration, e-commerce adoption, social platform usage, ad costs, cultural behavior analysis, country opportunity scoring, entry strategy recommendation
- [ ] Agent 2: Country Strategy - brand positioning, cultural tone, price sensitivity, messaging style, platform mix per country, strategic blueprint generation

### 4B. Advertising & Social Agents (Agents 3-4)
- [ ] Agent 3: Paid Ads Architecture - Google/Bing/Meta/TikTok/Snapchat API integration stubs, campaign creation, retargeting logic, smart bidding, budget optimization, conversion tracking
- [ ] Agent 4: Organic Social Automation - post scheduling engine, engagement optimization, hashtag strategy, tone adaptation per country

### 4C. Content & Creative Agents (Agents 5-6)
- [ ] Agent 5: AI Content & Blog Engine - SEO keyword research (via Sonnet), long-form blog generation, internal linking, schema markup, auto-publish to Shopify, content localization
- [ ] Agent 6: Creative Generation - ad copy generation (Sonnet), video script generation, UGC scripts, brand tone consistency validation

### 4D. Analytics & Budget Agents (Agents 7-8)
- [ ] Agent 7: Performance Analytics - unified metrics computation (CAC, LTV, ROAS, MER), funnel drop-off analysis, attribution modeling (last click, linear, time decay, position based)
- [ ] Agent 8: Budget Optimization - dynamic allocation engine, scale high ROAS campaigns, auto-pause underperformers, risk management rules

### 4E. Testing & Conversion Agents (Agents 9-10)
- [ ] Agent 9: A/B Testing - test creation and management, statistical confidence scoring (Bayesian), variant comparison, iterative improvement recommendations
- [ ] Agent 10: Conversion Optimization - funnel analysis, UX recommendation generation (via Opus), checkout optimization suggestions

### 4F. Integration & Localization Agents (Agents 11-12)
- [ ] Agent 11: Shopify Integration - product & inventory sync (titles, images, descriptions, variants, stock), blog sync, pixel/conversion tracking validation, webhook automation, upsell/funnel integration
- [ ] Agent 12: Multi-Language Localization - native-level translation (via Sonnet), cultural adaptation rules, currency conversion, legal compliance messaging per country

### 4G. Compliance & Intelligence Agents (Agents 13-14)
- [ ] Agent 13: Compliance & Regulatory - GDPR/CCPA/local ad law rule engine, advertising restriction enforcement, data protection validation, high-risk campaign flagging
- [ ] Agent 14: Competitive Intelligence - competitor monitoring framework, trend detection, messaging gap analysis

### 4H. Security & Detection Agents (Agents 15-16)
- [ ] Agent 15: Fraud & Anomaly Detection - click fraud detection rules, bot traffic analysis, conversion anomaly alerts, budget misuse detection
- [ ] Agent 16: Brand Consistency - tone analysis (via Opus), messaging alignment verification, logo/color usage validation, campaign alignment check

### 4I. Infrastructure Agents (Agents 17-18)
- [ ] Agent 17: Data Engineering - event tracking validation, server-side tracking setup, data pipeline management, data normalization, error logging
- [ ] Agent 18: Enterprise Security - API key rotation automation, role-based access enforcement, audit log generation, secret vault management, encryption validation, SOC2 readiness checks, DDoS protection config

### 4J. Forecasting Agent (Agent 19)
- [ ] Agent 19: Revenue Forecasting - predictive modeling (via Opus), LTV/CAC modeling, break-even analysis, scenario simulations (conservative/base/aggressive)

### 4K. Testing (3x per module)
- [ ] Unit tests for all 20 agent modules
- [ ] Integration tests for agent-to-agent interactions
- [ ] End-to-end tests for agent workflows with real AI calls

---

## PHASE 5: KILL SWITCH & GOVERNANCE SYSTEM
> Autonomous kill switch architecture, AI governance, risk management

### 5A. Kill Switch Backend
- [ ] Global kill switch (stops all campaigns, automation, locks API keys)
- [ ] Campaign-level pause/resume
- [ ] Country-specific pause/resume
- [ ] Automation pause (stop agent autonomous actions)
- [ ] API key locking mechanism
- [ ] Multi-layer halt levels: Level 1 (pause scaling), Level 2 (pause new campaigns), Level 3 (pause country), Level 4 (full shutdown)
- [ ] Kill switch state persistence and recovery

### 5B. Automated Triggers
- [ ] ROAS drop below threshold trigger
- [ ] Spend anomaly detection trigger (>200% daily baseline)
- [ ] Conversion tracking failure trigger (pixel stops firing)
- [ ] CPC spike trigger (>150% average)
- [ ] API error storm trigger (>50 errors/min)
- [ ] Fraud alert score trigger (>90 confidence)
- [ ] Trigger configuration API (enable/disable, thresholds)
- [ ] Trigger event logging and history

### 5C. AI Governance System
- [ ] Risk scoring for every AI decision
- [ ] Confidence gating (block low-confidence actions)
- [ ] Strategy validation before execution
- [ ] Rollback plan generation for risky actions
- [ ] Explainable AI logs for all decisions
- [ ] Immutable audit trail
- [ ] Manual override hierarchy (human > orchestrator > agent)
- [ ] Action approval workflow (semi-auto mode)

### 5D. Testing (3x per module)
- [ ] Unit tests for kill switch logic
- [ ] Integration tests for automated triggers
- [ ] End-to-end tests for governance workflows

---

## PHASE 6: ENTERPRISE INFRASTRUCTURE
> Monitoring, alerting, data quality, security hardening, scaling

### 6A. Monitoring & Alerting
- [ ] Real-time spend monitoring
- [ ] CTR, CPC, conversion anomaly detection
- [ ] Alert delivery: email notifications
- [ ] Alert delivery: Slack/Teams webhooks
- [ ] Escalation rules (multiple alerts -> escalation)
- [ ] Alert acknowledgment and resolution tracking

### 6B. Data Quality & Validation
- [ ] Schema enforcement on all data inputs
- [ ] Shopify data verification (product/inventory consistency)
- [ ] Ad spend validation (platform vs internal records)
- [ ] Data lineage tracking
- [ ] PII anonymization for GDPR/CCPA
- [ ] Consent management system

### 6C. Security Hardening
- [ ] API key auto-rotation (30-day cycle)
- [ ] Encryption at rest (AES-256 for stored data)
- [ ] Encryption in transit (TLS 1.3)
- [ ] Secrets manager integration
- [ ] SOC2-ready immutable logging
- [ ] DDoS protection (rate limiting, traffic filtering)
- [ ] IP whitelisting for API access
- [ ] Agent-specific access scopes
- [ ] Automated threat scanning

### 6D. Observability
- [ ] Distributed tracing for AI agent decisions and API calls
- [ ] Error aggregation dashboard
- [ ] AI confidence drift metrics over time
- [ ] Log retention policies (configurable 1-3 years)
- [ ] Health check endpoints for all services

### 6E. Failover & Redundancy
- [ ] Backend failover logic
- [ ] Database backup & restore workflows
- [ ] Retry mechanisms for all external API calls
- [ ] Graceful degradation (partial system operation on failure)

### 6F. Testing (3x per module)
- [ ] Unit tests for monitoring and alerting
- [ ] Integration tests for security features
- [ ] End-to-end tests for failover scenarios

---

## PHASE 7: ADVANCED AI CAPABILITIES
> Simulation, continuous learning, advanced marketing models

### 7A. Simulation Engine
- [ ] Synthetic campaign simulation (dry-run before live)
- [ ] Scaling outcome prediction
- [ ] Competitor reaction modeling
- [ ] CPC inflation modeling
- [ ] Audience saturation modeling
- [ ] Strategy simulation sandbox (historical data testing)
- [ ] Risk assessment before live campaign launch

### 7B. Continuous Learning System
- [ ] Reinforcement learning loop (strategy improvement from outcomes)
- [ ] Strategy memory (what worked per country/channel)
- [ ] Country performance memory
- [ ] Creative fatigue detection and rotation triggers
- [ ] Seasonal adjustment AI
- [ ] Trend optimization from market signals

### 7C. Institutional Marketing Capabilities
- [ ] Marketing Mix Modeling
- [ ] Bayesian attribution model
- [ ] Econometric modeling
- [ ] Geo lift testing framework
- [ ] Brand lift survey integration
- [ ] Offline attribution support
- [ ] Media saturation modeling
- [ ] Diminishing return curves

### 7D. Strategic AI Commander Layer
- [ ] 30/60/90 day projections
- [ ] Risk-weighted scenario generation
- [ ] Internal challenge system (AI questions its own decisions)
- [ ] Downside exposure evaluation
- [ ] Conservative vs aggressive strategy comparison
- [ ] Pre-budget simulation before allocation

### 7E. Campaign Health AI Monitor
- [ ] CPA volatility detection
- [ ] Spend velocity anomaly detection
- [ ] Creative fatigue scoring
- [ ] CTR collapse early warning
- [ ] Pixel signal loss alert

### 7F. Testing (3x per module)
- [ ] Unit tests for simulation engine
- [ ] Integration tests for learning system
- [ ] End-to-end tests for strategic AI layer

---

## PHASE 8: EXTERNAL INTEGRATIONS
> Platform APIs, CRM, email marketing, analytics/BI tools

### 8A. Ad Platform Integrations
- [ ] Google Ads API - campaign CRUD, bidding, reporting
- [ ] Meta Marketing API - campaign CRUD, audiences, reporting
- [ ] TikTok Ads API - campaign CRUD, creatives, reporting
- [ ] Bing Ads API - campaign CRUD, bidding, reporting
- [ ] Snapchat Marketing API - campaign CRUD, reporting

### 8B. Shopify Integration
- [ ] Shopify Admin API - product sync (titles, images, descriptions, variants, stock)
- [ ] Blog/content publishing via API
- [ ] Webhook registration and handling (order created, product updated, etc.)
- [ ] Pixel/conversion tracking validation

### 8C. CRM & Email Integrations
- [ ] Salesforce integration (contact/lead sync)
- [ ] HubSpot integration (contact/deal sync)
- [ ] Klaviyo integration (email marketing sync)
- [ ] Mailchimp integration (audience/campaign sync)
- [ ] Iterable integration (user/event sync)

### 8D. Analytics/BI Integrations
- [ ] Looker integration (data export)
- [ ] Tableau integration (data connector)
- [ ] Power BI integration (data feed)

### 8E. Testing (3x per module)
- [ ] Unit tests for all API integrations
- [ ] Integration tests with sandbox/test accounts
- [ ] End-to-end tests for data flow across platforms

---

## PHASE 9: UI-BACKEND INTEGRATION
> Connect all 23 frontend pages to live backend APIs (spec critical requirement)

### 9A. API Client Refactor
- [ ] Replace all inline mock data with API calls
- [ ] Implement React Query/SWR for data fetching, caching, revalidation
- [ ] Error state handling on all pages
- [ ] Loading states with skeleton UI
- [ ] Optimistic updates for user actions

### 9B. Page-by-Page Integration
- [ ] Dashboard - live KPIs, real-time agent status, live alerts
- [ ] Market Intelligence - live country data from Agent 1
- [ ] Country Strategy - live strategy from Agent 2
- [ ] Paid Ads - live campaigns from Agent 3 + platform APIs
- [ ] Organic Social - live posts/scheduling from Agent 4
- [ ] Content & Blog - live content from Agent 5
- [ ] Creative Studio - live generation from Agent 6 + Anthropic API
- [ ] Analytics - live metrics from Agent 7
- [ ] Budget Optimizer - live allocation from Agent 8
- [ ] A/B Testing - live tests from Agent 9
- [ ] Conversion - live funnel data from Agent 10
- [ ] Shopify - live sync from Agent 11 + Shopify API
- [ ] Localization - live translations from Agent 12
- [ ] Compliance - live rules from Agent 13
- [ ] Competitive Intel - live monitoring from Agent 14
- [ ] Fraud Detection - live alerts from Agent 15
- [ ] Brand Consistency - live checks from Agent 16
- [ ] Data Engineering - live pipeline status from Agent 17
- [ ] Security - live events from Agent 18
- [ ] Revenue Forecast - live projections from Agent 19
- [ ] Orchestrator - live agent coordination from Agent 20
- [ ] Kill Switch - live controls connected to backend kill switch
- [ ] Settings - live configuration save/load, API key management

### 9C. Real-Time Features
- [ ] WebSocket connection for live agent status updates
- [ ] Real-time alert push notifications
- [ ] Live KPI updates without page refresh
- [ ] Kill switch instant state propagation

### 9D. Testing (3x per module)
- [ ] Unit tests for API client layer
- [ ] Integration tests for each page with backend
- [ ] End-to-end tests for full user workflows

---

## PHASE 10: FINAL OUTPUT REQUIREMENTS & SYSTEM TESTING
> Spec Section 6 deliverables + full end-to-end validation

### 10A. Final Output Deliverables (Spec Section 6)
- [ ] 1. Country ranking & opportunity table (live from Agent 1)
- [ ] 2. Marketing strategy per country (live from Agent 2)
- [ ] 3. Channel allocation matrix (live from Agents 3, 7, 8)
- [ ] 4. Budget allocation model (live from Agent 8)
- [ ] 5. Risk assessment report (live from Agents 13, 15, 18)
- [ ] 6. ROI projection (live from Agent 19)
- [ ] 7. 90-day execution roadmap (live from Agent 20)
- [ ] 8. Confidence score 0-100 (system-wide from Orchestrator)
- [ ] 9. Weakness & improvement report (from cross-challenge protocol)
- [ ] 10. Recommendations to reach enterprise perfection (from Agent 20)

### 10B. Non-Negotiable Rules Validation (Spec Section 7)
- [ ] Verify NO placeholder or fake data in production
- [ ] Verify NO hardcoded values (all from DB/config/API)
- [ ] Verify ALL API calls fully validated
- [ ] Verify ALL automation traceable & auditable
- [ ] Verify ALL logic is explainable (decision logs)
- [ ] Verify campaigns cannot execute without risk & confidence checks
- [ ] Verify human override & kill switches functional
- [ ] Verify Anthropic API keys configured for Opus + Sonnet
- [ ] Verify ALL backend modules tested 3x
- [ ] Verify full end-to-end UI-backend integration
- [ ] Verify continuous monitoring and automated alerts active

### 10C. System-Wide End-to-End Testing
- [ ] Full agent cycle test: all 20 agents run, cross-challenge, produce outputs
- [ ] Kill switch test: activate/deactivate all levels, verify system halts/resumes
- [ ] Governance test: low-confidence decision blocked, human override works
- [ ] Data flow test: data flows from platform APIs -> backend -> AI agents -> UI
- [ ] Alert test: trigger anomaly, verify alert fires, escalation works
- [ ] Security test: unauthorized access blocked, audit log generated
- [ ] Performance test: system handles concurrent agent operations
- [ ] Recovery test: simulate failure, verify graceful degradation and recovery

### 10D. Deployment Readiness
- [ ] CI/CD pipeline configured
- [ ] Environment configuration for production
- [ ] Database migration scripts verified
- [ ] Health check endpoints responding
- [ ] Documentation for system operators

---

## PHASE SUMMARY

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | UI Frontend (23 pages, components, routing) | COMPLETE |
| Phase 2 | Backend Foundation & Database | NOT STARTED |
| Phase 3 | AI Agent System (Opus + Sonnet) | NOT STARTED |
| Phase 4 | 20 Agent Modules (Backend Logic) | NOT STARTED |
| Phase 5 | Kill Switch & Governance System | NOT STARTED |
| Phase 6 | Enterprise Infrastructure | NOT STARTED |
| Phase 7 | Advanced AI Capabilities | NOT STARTED |
| Phase 8 | External Integrations | NOT STARTED |
| Phase 9 | UI-Backend Integration | NOT STARTED |
| Phase 10 | Final Outputs & System Testing | NOT STARTED |

---

## FILES COMPLETED

### UI Source Files (Phase 1)
```
ui/src/App.tsx
ui/src/main.tsx
ui/src/index.css
ui/src/types/index.ts
ui/src/services/api.ts
ui/src/context/AppContext.tsx
ui/src/components/layout/Header.tsx
ui/src/components/layout/Sidebar.tsx
ui/src/components/shared/Card.tsx
ui/src/components/shared/ConfidenceScore.tsx
ui/src/components/shared/DataTable.tsx
ui/src/components/shared/KPICard.tsx
ui/src/components/shared/PageHeader.tsx
ui/src/components/shared/ProgressBar.tsx
ui/src/components/shared/StatusBadge.tsx
ui/src/pages/Dashboard.tsx
ui/src/pages/MarketIntelligence.tsx
ui/src/pages/CountryStrategy.tsx
ui/src/pages/PaidAds.tsx
ui/src/pages/OrganicSocial.tsx
ui/src/pages/ContentBlog.tsx
ui/src/pages/CreativeStudio.tsx
ui/src/pages/Analytics.tsx
ui/src/pages/BudgetOptimizer.tsx
ui/src/pages/ABTesting.tsx
ui/src/pages/Conversion.tsx
ui/src/pages/Shopify.tsx
ui/src/pages/Localization.tsx
ui/src/pages/Compliance.tsx
ui/src/pages/CompetitiveIntel.tsx
ui/src/pages/FraudDetection.tsx
ui/src/pages/BrandConsistency.tsx
ui/src/pages/DataEngineering.tsx
ui/src/pages/Security.tsx
ui/src/pages/RevenueForecast.tsx
ui/src/pages/Orchestrator.tsx
ui/src/pages/KillSwitch.tsx
ui/src/pages/Settings.tsx
```

### Config Files (Phase 1)
```
ui/vite.config.ts
ui/tsconfig.json
ui/tsconfig.app.json
ui/tsconfig.node.json
ui/package.json
ui/eslint.config.js
ui/index.html
ui/.gitignore
```
