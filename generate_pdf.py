#!/usr/bin/env python3
"""
Generate a comprehensive PDF instruction manual for the
AI International Growth Engine marketing platform.
"""

from fpdf import FPDF
import textwrap

class InstructionPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 10, "AI International Growth Engine - Instructions & Optimization Guide", align="C")
            self.ln(5)
            self.set_draw_color(200, 200, 200)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def title_page(self):
        self.add_page()
        self.ln(50)
        self.set_font("Helvetica", "B", 28)
        self.set_text_color(30, 58, 138)
        self.cell(0, 15, "AI International Growth Engine", align="C")
        self.ln(20)
        self.set_font("Helvetica", "", 16)
        self.set_text_color(80, 80, 80)
        self.cell(0, 10, "Complete Instructions, Usage Guide", align="C")
        self.ln(8)
        self.cell(0, 10, "& Optimization Manual", align="C")
        self.ln(25)
        self.set_draw_color(30, 58, 138)
        self.set_line_width(0.5)
        self.line(60, self.get_y(), 150, self.get_y())
        self.ln(15)
        self.set_font("Helvetica", "", 11)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "20-Agent AI-Powered Marketing & International Expansion Platform", align="C")
        self.ln(6)
        self.cell(0, 8, "Powered by Anthropic Claude (Opus & Sonnet)", align="C")
        self.ln(30)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 8, "Version 1.0.0", align="C")
        self.ln(6)
        self.cell(0, 8, "March 2026", align="C")

    def section_title(self, title, level=1):
        self.ln(4)
        if level == 1:
            self.set_font("Helvetica", "B", 18)
            self.set_text_color(30, 58, 138)
            self.cell(0, 12, title)
            self.ln(3)
            self.set_draw_color(30, 58, 138)
            self.set_line_width(0.4)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(6)
        elif level == 2:
            self.set_font("Helvetica", "B", 14)
            self.set_text_color(50, 80, 160)
            self.cell(0, 10, title)
            self.ln(6)
        elif level == 3:
            self.set_font("Helvetica", "B", 12)
            self.set_text_color(70, 70, 70)
            self.cell(0, 8, title)
            self.ln(5)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, text, indent=10):
        x = self.get_x()
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.set_x(x + indent)
        self.multi_cell(0, 5.5, f"-  {text}")
        self.ln(1)

    def numbered_item(self, number, text, indent=10):
        x = self.get_x()
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 58, 138)
        self.set_x(x + indent)
        self.cell(8, 5.5, f"{number}.")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def code_block(self, code):
        self.set_font("Courier", "", 9)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(40, 40, 40)
        self.set_draw_color(200, 200, 200)
        y_start = self.get_y()
        lines = code.strip().split('\n')
        block_height = len(lines) * 5 + 6
        if self.get_y() + block_height > 270:
            self.add_page()
            y_start = self.get_y()
        self.rect(12, y_start, 186, block_height)
        self.set_xy(15, y_start + 3)
        for line in lines:
            if self.get_y() > 270:
                self.add_page()
            self.set_x(15)
            self.cell(0, 5, line[:95])
            self.ln(5)
        self.ln(4)
        self.set_font("Helvetica", "", 10)

    def env_var_row(self, var, required, default, desc):
        self.set_font("Courier", "", 8)
        self.set_text_color(30, 58, 138)
        start_x = self.get_x()
        self.cell(55, 5, var)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(40, 40, 40)
        self.cell(18, 5, required)
        self.cell(35, 5, default)
        self.cell(0, 5, desc)
        self.ln(5.5)

    def table_header(self, cols):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(30, 58, 138)
        self.set_text_color(255, 255, 255)
        widths = [55, 18, 35, 82]
        for i, col in enumerate(cols):
            w = widths[i] if i < len(widths) else 40
            self.cell(w, 7, col, fill=True)
        self.ln(7)
        self.set_text_color(40, 40, 40)

    def note_box(self, text, box_type="info"):
        colors = {
            "info": (219, 234, 254),
            "warning": (254, 243, 199),
            "important": (254, 226, 226),
            "tip": (209, 250, 229),
        }
        border_colors = {
            "info": (59, 130, 246),
            "warning": (245, 158, 11),
            "important": (239, 68, 68),
            "tip": (34, 197, 94),
        }
        bg = colors.get(box_type, colors["info"])
        border = border_colors.get(box_type, border_colors["info"])
        self.set_fill_color(*bg)
        self.set_draw_color(*border)
        self.set_line_width(0.3)
        y_start = self.get_y()
        self.set_font("Helvetica", "B", 9)
        label = box_type.upper()
        self.set_text_color(*border)
        # Calculate height needed
        self.set_font("Helvetica", "", 9)
        lines = self.multi_cell(175, 5, text, dry_run=True, output="LINES")
        h = len(lines) * 5 + 12
        if y_start + h > 270:
            self.add_page()
            y_start = self.get_y()
        self.rect(12, y_start, 186, h, style="DF")
        self.set_xy(15, y_start + 3)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 5, label + ":")
        self.ln(5)
        self.set_x(15)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(40, 40, 40)
        self.multi_cell(178, 5, text)
        self.set_y(y_start + h + 3)
        self.ln(2)


def build_pdf():
    pdf = InstructionPDF()
    pdf.alias_nb_pages()

    # =========================================================================
    # TITLE PAGE
    # =========================================================================
    pdf.title_page()

    # =========================================================================
    # TABLE OF CONTENTS
    # =========================================================================
    pdf.add_page()
    pdf.section_title("Table of Contents")
    toc = [
        "1. Platform Overview",
        "2. System Requirements & Prerequisites",
        "3. Installation - Step by Step",
        "   3.1 Clone the Repository",
        "   3.2 Environment Configuration",
        "   3.3 Docker Deployment (Recommended)",
        "   3.4 Manual Deployment (Without Docker)",
        "   3.5 Database Setup & Migrations",
        "   3.6 Seed Data (Development)",
        "4. Starting the Application",
        "   4.1 Development Mode",
        "   4.2 Production Mode",
        "   4.3 Docker Production Stack",
        "5. The 20 AI Agents - Complete Reference",
        "   5.1 Agent Architecture Overview",
        "   5.2 Core Agent Modules (1-19)",
        "   5.3 Master Orchestrator Agent (#20)",
        "   5.4 Cross-Challenge Protocol",
        "   5.5 AI Model Integration (Opus & Sonnet)",
        "6. UI Dashboard - All Pages & Features",
        "7. API Reference - All Endpoints",
        "8. Authentication & Security",
        "   8.1 JWT Authentication & MFA",
        "   8.2 Role-Based Access Control (RBAC)",
        "   8.3 API Key Management",
        "9. Kill Switch System",
        "10. Optimization Guide",
        "   10.1 Agent Performance Optimization",
        "   10.2 AI Cost Optimization",
        "   10.3 Database Optimization",
        "   10.4 Redis Cache Optimization",
        "   10.5 Frontend Performance",
        "   10.6 Docker & Infrastructure",
        "11. Monitoring, Health Checks & Alerts",
        "12. Testing - Running All Test Suites",
        "13. CI/CD Pipeline",
        "14. Troubleshooting Guide",
        "15. Environment Variables - Complete Reference",
    ]
    for item in toc:
        if item.startswith("   "):
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(80, 80, 80)
            pdf.set_x(25)
            pdf.cell(0, 6, item.strip())
        else:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(30, 58, 138)
            pdf.cell(0, 7, item)
        pdf.ln(6)

    # =========================================================================
    # 1. PLATFORM OVERVIEW
    # =========================================================================
    pdf.add_page()
    pdf.section_title("1. Platform Overview")
    pdf.body_text(
        "The AI International Growth Engine is an enterprise-grade, AI-powered marketing platform "
        "designed for international market expansion. It orchestrates 20 autonomous AI agents -- powered "
        "by Anthropic Claude (Opus as the primary model, Sonnet as the sub-agent model) -- to manage "
        "multi-country campaigns, optimize budgets, generate creative content, and deliver real-time "
        "performance analytics."
    )
    pdf.body_text(
        "The platform operates as a self-improving closed-loop optimization engine with multi-level "
        "kill switches, risk-aware autonomous decision-making, and full auditability. Every AI decision "
        "is logged, scored for confidence, and subjected to a cross-challenge protocol where agents "
        "peer-review each other's outputs."
    )

    pdf.section_title("Architecture", level=2)
    pdf.body_text(
        "The system follows a three-tier architecture:"
    )
    pdf.bullet("Frontend: React 19 SPA served by nginx with reverse proxy to the API")
    pdf.bullet("Backend: Node.js/Express REST API with 20 AI agent modules")
    pdf.bullet("Data Layer: PostgreSQL 16 (primary database) + Redis 7 (cache & queue)")
    pdf.ln(2)

    pdf.section_title("Tech Stack", level=2)
    pdf.bullet("Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4, Recharts 3, Lucide Icons")
    pdf.bullet("Backend: Node.js 20, Express, TypeScript, Zod validation")
    pdf.bullet("AI: Anthropic Claude Opus + Sonnet, cross-challenge verification protocol")
    pdf.bullet("Database: PostgreSQL 16 with connection pooling")
    pdf.bullet("Cache/Queue: Redis 7 with sliding-window rate limiting")
    pdf.bullet("Auth: JWT + MFA (TOTP), bcrypt password hashing, AES-256 encryption")
    pdf.bullet("Infrastructure: Docker multi-stage builds, docker compose, nginx, GitHub Actions CI/CD")
    pdf.bullet("Testing: Jest (server), Vitest + Testing Library + MSW (UI)")

    # =========================================================================
    # 2. SYSTEM REQUIREMENTS
    # =========================================================================
    pdf.add_page()
    pdf.section_title("2. System Requirements & Prerequisites")

    pdf.section_title("Required Software", level=2)
    pdf.bullet("Node.js 20+ (LTS recommended)")
    pdf.bullet("npm 9+ (ships with Node 20)")
    pdf.bullet("PostgreSQL 16+ (with gen_random_uuid() support)")
    pdf.bullet("Redis 7+")
    pdf.bullet("Docker & Docker Compose (for containerized deployment)")
    pdf.bullet("Git (for cloning the repository)")

    pdf.section_title("Hardware Recommendations", level=2)
    pdf.bullet("Development: 4+ GB RAM, 2+ CPU cores, 10 GB free disk space")
    pdf.bullet("Production: 8+ GB RAM, 4+ CPU cores, 50+ GB SSD storage")
    pdf.bullet("The AI agents are compute-intensive when processing; scale horizontally for high throughput")

    pdf.section_title("Network Requirements", level=2)
    pdf.bullet("Outbound access to api.anthropic.com (for AI agent features)")
    pdf.bullet("Ports: 80 (UI/nginx), 3001 (API server), 5432 (PostgreSQL), 6379 (Redis)")
    pdf.bullet("HTTPS/TLS recommended for production deployments")

    # =========================================================================
    # 3. INSTALLATION
    # =========================================================================
    pdf.add_page()
    pdf.section_title("3. Installation - Step by Step")

    pdf.section_title("3.1 Clone the Repository", level=2)
    pdf.code_block("git clone <repository-url>\ncd marketing")

    pdf.section_title("3.2 Environment Configuration", level=2)
    pdf.body_text(
        "The server uses environment variables validated by Zod on startup. In production, missing "
        "required variables will prevent the server from starting. In development, sensible defaults "
        "are applied automatically."
    )

    pdf.numbered_item(1, "Copy the example environment file:")
    pdf.code_block("cp server/.env.example server/.env")

    pdf.numbered_item(2, "Edit server/.env and configure at minimum these variables:")
    pdf.code_block(
        "# PostgreSQL connection\n"
        "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_growth_engine\n\n"
        "# JWT signing secret (min 32 characters for production)\n"
        "JWT_SECRET=your-secret-key-at-least-32-characters\n\n"
        "# AES-256 encryption key (exactly 32 characters for production)\n"
        "ENCRYPTION_KEY=your-32-character-encryption-key!\n\n"
        "# Anthropic API key (enables all AI agent features)\n"
        "ANTHROPIC_API_KEY=sk-ant-your-key-here"
    )

    pdf.note_box(
        "Without an ANTHROPIC_API_KEY, the system starts in graceful degradation mode. "
        "All non-AI features work normally, but the 20 AI agents will not be able to call "
        "the Claude API. Set this key to enable full AI functionality.",
        "important"
    )

    pdf.numbered_item(3, "For production, use the production example file as reference:")
    pdf.code_block("cp server/.env.production.example server/.env")
    pdf.body_text(
        "Production requires: DATABASE_URL, JWT_SECRET (min 32 chars), ENCRYPTION_KEY (exactly 32 chars), "
        "DB_SSL=true, and a strong REDIS_PASSWORD."
    )

    pdf.section_title("3.3 Docker Deployment (Recommended)", level=2)
    pdf.body_text(
        "Docker is the recommended deployment method. The docker-compose.yml file defines the full "
        "production stack with health checks for all services."
    )

    pdf.numbered_item(1, "Start all services (PostgreSQL, Redis, Server, UI):")
    pdf.code_block("docker compose up -d")

    pdf.numbered_item(2, "Verify all containers are healthy:")
    pdf.code_block("docker compose ps")

    pdf.numbered_item(3, "Run database migrations:")
    pdf.code_block('docker compose exec server node -e "require(\'./dist/migrations/run\')"')

    pdf.numbered_item(4, "Access the application:")
    pdf.code_block("# UI: http://localhost (port 80, served by nginx)\n# API: http://localhost:3001 (direct) or http://localhost/api/* (via nginx proxy)")

    pdf.body_text("Docker services included:")
    pdf.bullet("postgres: PostgreSQL 16 Alpine with persistent volume, health checks, 128MB shared memory")
    pdf.bullet("redis: Redis 7 Alpine with AOF persistence, 256MB max memory, LRU eviction policy")
    pdf.bullet("server: Node.js 20 Alpine multi-stage build with dumb-init, non-root user, health check")
    pdf.bullet("ui: nginx Alpine serving the Vite-built React SPA with security headers, gzip, API proxy")

    pdf.section_title("3.4 Manual Deployment (Without Docker)", level=2)
    pdf.body_text(
        "For manual deployment, you need PostgreSQL and Redis running locally or accessible on your network."
    )

    pdf.section_title("Option A: Use Docker for infrastructure only", level=3)
    pdf.code_block(
        "# Start only PostgreSQL and Redis via the dev compose file\n"
        "docker compose -f docker-compose.dev.yml up -d"
    )

    pdf.section_title("Option B: Native PostgreSQL and Redis", level=3)
    pdf.body_text("Ensure PostgreSQL 16+ and Redis 7+ are running on their default ports (5432 and 6379).")

    pdf.section_title("Then install and start the server:", level=3)
    pdf.code_block(
        "cd server\n"
        "npm install\n"
        "npm run migrate       # Run database migrations (001-006)\n"
        "npm run seed           # Optional: seed development data\n"
        "npm run dev            # Start server with hot-reload on http://localhost:3001"
    )

    pdf.section_title("Then install and start the UI (in a new terminal):", level=3)
    pdf.code_block(
        "cd ui\n"
        "npm install\n"
        "npm run dev            # Start Vite dev server on http://localhost:5173"
    )

    pdf.section_title("3.5 Database Setup & Migrations", level=2)
    pdf.body_text(
        "The database schema is managed through 6 sequential migration files. The migration runner "
        "tracks applied migrations in a _migrations table to prevent re-execution."
    )

    pdf.section_title("Migration Files", level=3)
    pdf.bullet("001_initial_schema.sql - Core tables: users, countries, campaigns, agent_states, agent_decisions")
    pdf.bullet("002_phase5_phase6_tables.sql - Integration tables and agent framework tables")
    pdf.bullet("003_phase7_tables.sql - Advanced AI, monitoring, simulation, and learning tables")
    pdf.bullet("004_phase8_tables.sql - Queue, rate limit, dashboard, and infrastructure tables")
    pdf.bullet("005_new_features.sql - Notifications, audit logs, API key management tables")
    pdf.bullet("006_final_outputs.sql - Final output snapshots, validations, and maturity scoring tables")

    pdf.section_title("Running Migrations", level=3)
    pdf.code_block(
        "cd server\n"
        "npm run migrate                    # Apply all pending migrations\n"
        "npx tsx src/migrations/verify.ts   # Verify migration integrity"
    )

    pdf.section_title("3.6 Seed Data (Development Only)", level=2)
    pdf.code_block("cd server\nnpm run seed")
    pdf.note_box("Seed data is for development/testing only. Never run seeds in production.", "warning")

    # =========================================================================
    # 4. STARTING THE APPLICATION
    # =========================================================================
    pdf.add_page()
    pdf.section_title("4. Starting the Application")

    pdf.section_title("4.1 Development Mode", level=2)
    pdf.body_text("Development mode provides hot-reload for both server and UI.")

    pdf.section_title("Server (terminal 1):", level=3)
    pdf.code_block("cd server\nnpm run dev    # tsx watch, hot-reloads on http://localhost:3001")

    pdf.section_title("UI (terminal 2):", level=3)
    pdf.code_block("cd ui\nnpm run dev    # Vite dev server on http://localhost:5173")

    pdf.section_title("4.2 Production Mode", level=2)
    pdf.section_title("Build:", level=3)
    pdf.code_block(
        "# Server\ncd server && npm run build    # TypeScript -> dist/\n\n"
        "# UI\ncd ui && npm run build         # Vite -> dist/"
    )
    pdf.section_title("Start:", level=3)
    pdf.code_block("NODE_ENV=production node server/dist/index.js")

    pdf.section_title("Using PM2 (recommended for production):", level=3)
    pdf.code_block(
        "npm install -g pm2\n"
        "pm2 start server/dist/index.js --name ai-growth-engine \\\n"
        "  --env production \\\n"
        "  --max-memory-restart 1G \\\n"
        "  --instances max\n"
        "pm2 save\n"
        "pm2 startup"
    )

    pdf.section_title("4.3 Docker Production Stack", level=2)
    pdf.code_block(
        "docker compose up -d              # Start all 4 services\n"
        "docker compose logs -f server     # Tail server logs\n"
        "docker compose ps                 # Check service health\n"
        "docker compose down               # Stop all services\n"
        "docker compose down -v            # Stop + remove volumes"
    )

    # =========================================================================
    # 5. THE 20 AI AGENTS
    # =========================================================================
    pdf.add_page()
    pdf.section_title("5. The 20 AI Agents - Complete Reference")

    pdf.section_title("5.1 Agent Architecture Overview", level=2)
    pdf.body_text(
        "The system employs 20 autonomous AI agents, each extending a BaseAgent abstract class. "
        "Every agent has: a structured lifecycle (process, persist, log), confidence scoring, "
        "database-backed state persistence, decision auditing, a child logger, and AI model invocation "
        "capabilities via the AnthropicClient."
    )
    pdf.body_text("Each agent must implement three abstract methods:")
    pdf.bullet("process(input) - Core domain logic that returns a structured AgentOutput")
    pdf.bullet("getSystemPrompt() - The Claude system prompt defining the agent's AI persona")
    pdf.bullet("getChallengeTargets() - Which peer agents this agent can cross-challenge")

    pdf.body_text("Agent outputs always include:")
    pdf.bullet("decision - The primary decision string")
    pdf.bullet("data - Structured supporting data")
    pdf.bullet("confidence - Score (0-100), level (low/medium/high/very_high), and factor breakdown")
    pdf.bullet("reasoning - Human-readable explanation of the decision")
    pdf.bullet("recommendations - Actionable recommendations list")
    pdf.bullet("warnings - Identified risks or issues")
    pdf.bullet("uncertainties - Areas lacking sufficient data or certainty")

    pdf.section_title("5.2 Core Agent Modules (1-19)", level=2)

    agents = [
        ("1. Market Intelligence Agent", "market_intelligence",
         "Analyzes GDP, internet penetration, e-commerce adoption, social platform usage by country, "
         "ad costs, and cultural behavior. Ranks country opportunity scores and recommends entry strategies."),
        ("2. Country Strategy Agent", "country_strategy",
         "Defines brand positioning, cultural tone, price sensitivity, messaging style, and preferred "
         "platform mix per country. Produces strategic blueprints for market entry."),
        ("3. Paid Ads Agent", "paid_ads",
         "Manages Google, Bing, Meta, TikTok, and Snapchat ad campaigns. Handles campaign creation, "
         "retargeting, smart bidding, budget optimization, and conversion tracking."),
        ("4. Organic Social Agent", "organic_social",
         "Automates daily posts, reels, carousels, and TikTok scripts. Manages scheduling, engagement "
         "optimization, hashtag strategy, and tone adaptation per platform."),
        ("5. Content & Blog Agent", "content_blog",
         "Performs SEO keyword research, generates long-form blog content, manages internal linking and "
         "schema markup. Auto-publishes to Shopify with content localization."),
        ("6. Creative Generation Agent", "creative_generation",
         "Generates ad copy, video scripts, UGC scripts, image concepts, thumbnails, and maintains "
         "brand tone consistency across all creative assets."),
        ("7. Performance Analytics Agent", "performance_analytics",
         "Provides a unified analytics dashboard covering CAC, LTV, ROAS, MER, funnel drop-offs, "
         "and cross-channel attribution modeling."),
        ("8. Budget Optimization Agent", "budget_optimization",
         "Handles dynamic budget allocation, scales high-ROAS campaigns, pauses underperforming ones, "
         "and enforces risk management budget rules."),
        ("9. A/B Testing Agent", "ab_testing",
         "Manages creative, landing page, pricing, and offer testing. Provides statistical confidence "
         "scoring and drives iterative improvements."),
        ("10. Conversion Optimization Agent", "conversion_optimization",
         "Analyzes landing page heatmaps, provides UX recommendations, optimizes funnels, and "
         "improves checkout flow for higher conversion rates."),
        ("11. Shopify Integration Agent", "shopify_integration",
         "Syncs products, inventory, blog content, and validates pixel/conversion tracking. Manages "
         "webhook automation and upsell/funnel integration with Shopify stores."),
        ("12. Localization Agent", "localization",
         "Provides native-level translation, cultural adaptation, currency conversion, and legal "
         "compliance messaging for each target market."),
        ("13. Compliance Agent", "compliance",
         "Enforces GDPR, CCPA, local ad laws, advertising restrictions, data protection compliance, "
         "and flags high-risk campaigns for review."),
        ("14. Competitive Intelligence Agent", "competitive_intelligence",
         "Monitors competitor advertising, social content, detects market trends, and performs "
         "messaging gap analysis."),
        ("15. Fraud Detection Agent", "fraud_detection",
         "Detects click fraud, bot traffic, conversion anomalies, and budget misuse. Issues alerts "
         "when anomalies are detected."),
        ("16. Brand Consistency Agent", "brand_consistency",
         "Verifies tone, messaging, logo consistency, and campaign alignment across all channels "
         "and markets."),
        ("17. Data Engineering Agent", "data_engineering",
         "Validates event tracking, manages server-side tracking, ensures clean data pipelines, "
         "handles data normalization, and monitors error logging."),
        ("18. Enterprise Security Agent", "enterprise_security",
         "Manages API key protection, role-based access enforcement, audit log integrity, secret "
         "vault operations, encryption validation, and SOC2 readiness checks."),
        ("19. Revenue Forecasting Agent", "revenue_forecasting",
         "Builds predictive models for LTV/CAC, performs break-even analysis, and runs scenario "
         "simulations for revenue projections."),
    ]

    for name, agent_type, desc in agents:
        pdf.section_title(name, level=3)
        pdf.set_font("Courier", "", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 4, f"Type: {agent_type}")
        pdf.ln(5)
        pdf.body_text(desc)

    pdf.add_page()
    pdf.section_title("5.3 Master Orchestrator Agent (#20)", level=2)
    pdf.body_text(
        "The Master Orchestrator is the central coordination agent. It aggregates outputs from all 19 "
        "sub-agents, detects contradictions, forces cross-challenges, and produces the final decision matrix."
    )
    pdf.body_text("The orchestrator's execution flow:")
    pdf.numbered_item(1, "Aggregation: Collects and merges outputs from all 19 agents via AgentAggregator")
    pdf.numbered_item(2, "Conflict Detection: Identifies contradictions between agent recommendations")
    pdf.numbered_item(3, "Cross-Challenge: Runs the CrossChallengeProtocol to validate all decisions")
    pdf.numbered_item(4, "Decision Matrix: Generates a weighted decision matrix via DecisionMatrixGenerator")
    pdf.numbered_item(5, "Action Assignment: Assigns final marketing actions via ActionAssigner")
    pdf.numbered_item(6, "Final Output: Produces 10 deliverables (country rankings, strategy, ROI projections, etc.)")

    pdf.section_title("5.4 Cross-Challenge Protocol", level=2)
    pdf.body_text(
        "The cross-challenge protocol is a peer-review system where each agent challenges at least 3 "
        "other agents. It runs in iterative rounds until convergence (no critical findings) or a "
        "maximum of 5 rounds."
    )
    pdf.body_text("Each challenge evaluates:")
    pdf.bullet("Confidence level (flags scores below 30 as critical, below 50 as warning)")
    pdf.bullet("Reasoning quality (flags empty or insufficient reasoning)")
    pdf.bullet("Risk indicators (excessive warnings, unaddressed uncertainties)")
    pdf.bullet("Data completeness against specified focus areas")
    pdf.bullet("Recommendation feasibility and specificity")
    pdf.ln(2)
    pdf.body_text("Three subsystems support the protocol:")
    pdf.bullet("InconsistencyDetector: Finds conflicting data points between agents")
    pdf.bullet("ContradictionResolver: Resolves detected contradictions with weighted scoring")
    pdf.bullet("GapReporter: Identifies missing coverage areas across the agent network")

    pdf.section_title("5.5 AI Model Integration (Opus & Sonnet)", level=2)
    pdf.body_text(
        "The AI layer wraps the Anthropic SDK through three client classes:"
    )
    pdf.bullet("AnthropicClient: Core wrapper with retry logic, token tracking, and structured error handling")
    pdf.bullet("OpusClient: Pre-configured for Claude Opus (primary agent model, higher capability)")
    pdf.bullet("SonnetClient: Pre-configured for Claude Sonnet (sub-agent tasks, faster and cheaper)")
    pdf.ln(2)
    pdf.body_text("Supporting infrastructure:")
    pdf.bullet("RateLimiter: Token bucket algorithm with Redis-backed distributed state. Controls requests/min, tokens/min, and max concurrency.")
    pdf.bullet("CostTracker: Records token usage and computes USD cost per request. Persists to PostgreSQL for billing and optimization.")
    pdf.bullet("ResponseValidator: Validates AI response structure and content quality")
    pdf.ln(2)
    pdf.body_text("AI Model Pricing (per million tokens):")
    pdf.bullet("Opus: $15 input / $75 output")
    pdf.bullet("Sonnet: $3 input / $15 output")

    # =========================================================================
    # 6. UI DASHBOARD
    # =========================================================================
    pdf.add_page()
    pdf.section_title("6. UI Dashboard - All Pages & Features")
    pdf.body_text(
        "The UI is a React 19 SPA with 23 pages, lazy-loaded for performance. It uses Tailwind CSS 4 "
        "for styling with full dark mode support, and Recharts 3 for data visualization."
    )

    pages = [
        ("/ (Dashboard)", "Main dashboard with KPI cards, charts, and system overview metrics"),
        ("/market-intelligence", "Global market data, country opportunity scores, and entry strategy recommendations"),
        ("/country-strategy", "Per-country strategic blueprints, brand positioning, and platform mix configuration"),
        ("/paid-ads", "Campaign management for Google, Bing, Meta, TikTok, Snapchat ads with real-time metrics"),
        ("/organic-social", "Social media automation, post scheduling, engagement metrics, and hashtag analytics"),
        ("/content-blog", "Blog content management, SEO tools, internal linking, and Shopify publishing"),
        ("/creative-studio", "Creative asset generation, ad copy editor, video script tools, and brand assets"),
        ("/analytics", "Performance analytics with CAC, LTV, ROAS, MER metrics and attribution modeling"),
        ("/budget-optimizer", "Dynamic budget allocation interface, spend pacing, and ROAS optimization controls"),
        ("/ab-testing", "A/B test management, variant configuration, statistical confidence tracking"),
        ("/conversion", "Conversion funnel visualization, UX recommendations, and checkout optimization"),
        ("/shopify", "Shopify store integration, product sync status, inventory management, webhook configuration"),
        ("/localization", "Translation management, cultural adaptation tools, and multi-market content preview"),
        ("/compliance", "Regulatory compliance dashboard, GDPR/CCPA status, and high-risk campaign flags"),
        ("/competitive-intel", "Competitor monitoring, ad tracking, social content analysis, and trend detection"),
        ("/fraud-detection", "Click fraud alerts, bot detection dashboard, conversion anomaly monitoring"),
        ("/brand-consistency", "Brand guideline enforcement, tone analysis, visual identity verification"),
        ("/data-engineering", "Data pipeline status, event tracking validation, error log monitoring"),
        ("/security", "Enterprise security dashboard, API key status, audit logs, encryption validation"),
        ("/revenue-forecast", "Revenue prediction models, LTV/CAC projections, scenario simulations"),
        ("/orchestrator", "Master orchestrator control panel, agent status, decision matrix, cross-challenge results"),
        ("/kill-switch", "Emergency controls, halt level management, campaign/country pause controls"),
        ("/settings", "System settings, API key configuration, notification preferences, appearance/theme"),
    ]

    for route, desc in pages:
        pdf.set_font("Courier", "B", 9)
        pdf.set_text_color(30, 58, 138)
        pdf.cell(0, 5, route)
        pdf.ln(5)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(60, 60, 60)
        pdf.set_x(15)
        pdf.multi_cell(0, 5, desc)
        pdf.ln(2)

    # =========================================================================
    # 7. API REFERENCE
    # =========================================================================
    pdf.add_page()
    pdf.section_title("7. API Reference - All Endpoints")
    pdf.body_text(
        "All API routes are prefixed with /api/v1 (configurable via API_PREFIX env var). "
        "The API uses JSON for request/response bodies."
    )

    api_groups = [
        ("Authentication", "/api/v1/auth", ["POST /auth/register", "POST /auth/login", "POST /auth/refresh", "POST /auth/logout", "POST /auth/mfa/setup", "POST /auth/mfa/verify"]),
        ("Campaigns", "/api/v1/campaigns", ["GET /campaigns", "POST /campaigns", "GET /campaigns/:id", "PUT /campaigns/:id", "DELETE /campaigns/:id"]),
        ("Countries", "/api/v1/countries", ["GET /countries", "GET /countries/:id", "GET /countries/:id/strategy"]),
        ("Agents", "/api/v1/agents", ["GET /agents", "GET /agents/:type", "POST /agents/:type/run", "GET /agents/:type/decisions", "GET /agents/orchestrate"]),
        ("Kill Switch", "/api/v1/killswitch", ["POST /killswitch/activate", "POST /killswitch/deactivate", "GET /killswitch/status", "GET /killswitch/history", "POST /killswitch/pause-campaign", "POST /killswitch/resume-campaign", "POST /killswitch/pause-country", "POST /killswitch/resume-country", "POST /killswitch/lock-api-keys"]),
        ("Dashboard", "/api/v1/dashboard", ["GET /dashboard/overview", "GET /dashboard/metrics", "GET /dashboard/kpis"]),
        ("Budget", "/api/v1/budget", ["GET /budget", "POST /budget/allocate", "GET /budget/optimization"]),
        ("Creatives", "/api/v1/creatives", ["GET /creatives", "POST /creatives", "PUT /creatives/:id"]),
        ("Content", "/api/v1/content", ["GET /content", "POST /content", "PUT /content/:id"]),
        ("Products", "/api/v1/products", ["GET /products", "POST /products", "PUT /products/:id"]),
        ("Alerts", "/api/v1/alerts", ["GET /alerts", "PUT /alerts/:id/acknowledge"]),
        ("Settings", "/api/v1/settings", ["GET /settings", "PUT /settings", "GET /settings/apikeys", "PUT /settings/notifications", "PUT /settings/appearance"]),
        ("Integrations", "/api/v1/integrations", ["GET /integrations", "POST /integrations/:platform/connect", "DELETE /integrations/:platform/disconnect"]),
        ("Advanced AI", "/api/v1/advanced-ai", ["GET /advanced-ai/models", "POST /advanced-ai/simulate", "GET /advanced-ai/learning", "GET /advanced-ai/campaign-health"]),
        ("Final Outputs", "/api/v1/final-outputs", ["GET /final-outputs/country-ranking", "GET /final-outputs/strategy", "GET /final-outputs/channel-allocation", "GET /final-outputs/budget-allocation", "GET /final-outputs/risk-assessment", "GET /final-outputs/roi-projection", "GET /final-outputs/roadmap", "GET /final-outputs/confidence", "GET /final-outputs/weakness", "GET /final-outputs/perfection"]),
        ("Infrastructure", "/api/v1/infrastructure", ["GET /infrastructure/status", "GET /infrastructure/health"]),
        ("Webhooks", "/api/v1/webhooks", ["GET /webhooks", "POST /webhooks", "DELETE /webhooks/:id"]),
        ("Queue", "/api/v1/queue", ["GET /queue/status", "GET /queue/jobs"]),
        ("Notifications", "/api/v1/notifications", ["GET /notifications", "PUT /notifications/:id/read"]),
        ("Audit", "/api/v1/audit", ["GET /audit/logs", "GET /audit/logs/:id"]),
        ("API Keys", "/api/v1/apikeys", ["GET /apikeys", "POST /apikeys", "DELETE /apikeys/:id", "POST /apikeys/:id/rotate"]),
        ("Rate Limits", "/api/v1/ratelimits", ["GET /ratelimits/status"]),
        ("Health Check", "/health", ["GET /health", "GET /health/ready", "GET /health/live", "GET /health/deep"]),
    ]

    for group_name, base_path, endpoints in api_groups:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(30, 58, 138)
        pdf.cell(0, 6, group_name)
        pdf.ln(5)
        for ep in endpoints:
            pdf.set_font("Courier", "", 8)
            pdf.set_text_color(60, 60, 60)
            pdf.set_x(15)
            pdf.cell(0, 4.5, ep)
            pdf.ln(4.5)
        pdf.ln(3)

    # =========================================================================
    # 8. AUTH & SECURITY
    # =========================================================================
    pdf.add_page()
    pdf.section_title("8. Authentication & Security")

    pdf.section_title("8.1 JWT Authentication & MFA", level=2)
    pdf.body_text(
        "The system uses JWT (JSON Web Tokens) for stateless authentication with optional MFA (Multi-Factor "
        "Authentication) via TOTP (Time-based One-Time Passwords)."
    )
    pdf.body_text("Authentication flow:")
    pdf.numbered_item(1, "Register a user account via POST /api/v1/auth/register")
    pdf.numbered_item(2, "Login via POST /api/v1/auth/login to receive an access token and refresh token")
    pdf.numbered_item(3, "Include the access token in all subsequent requests via the Authorization header: Bearer <token>")
    pdf.numbered_item(4, "Refresh expired tokens via POST /api/v1/auth/refresh")
    pdf.numbered_item(5, "Optionally enable MFA via POST /api/v1/auth/mfa/setup (returns a TOTP QR code)")
    pdf.ln(2)
    pdf.body_text("Token configuration:")
    pdf.bullet("Access token TTL: 24 hours (configurable via JWT_EXPIRES_IN)")
    pdf.bullet("Refresh token TTL: 7 days (configurable via JWT_REFRESH_EXPIRES_IN)")
    pdf.bullet("Passwords are hashed with bcrypt")
    pdf.bullet("Sensitive data is encrypted with AES-256 using the ENCRYPTION_KEY")

    pdf.section_title("8.2 Role-Based Access Control (RBAC)", level=2)
    pdf.body_text("Four roles are defined with hierarchical permissions:")
    pdf.ln(2)
    pdf.bullet("admin: Full access to everything (wildcard * permission)")
    pdf.bullet("campaign_manager: Read all + write campaigns, creatives, content, budget, A/B tests")
    pdf.bullet("analyst: Read all + write reports and analytics")
    pdf.bullet("viewer: Read-only access to all resources")
    pdf.ln(2)
    pdf.body_text(
        "Permissions follow the format action:resource (e.g., write:campaigns). Wildcard matching "
        "is supported: read:* grants read access to all resources."
    )

    pdf.section_title("8.3 API Key Management", level=2)
    pdf.body_text(
        "API keys provide service-to-service authentication. They are managed through the /api/v1/apikeys "
        "endpoints and stored encrypted in the database. Keys can be rotated without downtime via the "
        "rotate endpoint. The kill switch can lock all API keys in emergencies."
    )

    # =========================================================================
    # 9. KILL SWITCH
    # =========================================================================
    pdf.add_page()
    pdf.section_title("9. Kill Switch System")
    pdf.body_text(
        "The kill switch provides multi-level emergency controls for halting or restricting system "
        "operations. Every state change is persisted, audit-logged, and triggers cache invalidation."
    )

    pdf.section_title("Halt Levels", level=2)
    pdf.bullet("Level 0: Normal operation - no restrictions")
    pdf.bullet("Level 1: Pause scaling - no new budget increases or campaign scaling allowed")
    pdf.bullet("Level 2: Pause new campaigns - existing campaigns continue, no new ones created")
    pdf.bullet("Level 3: Pause specific country - country-level restrictions, agent runs restricted")
    pdf.bullet("Level 4: Full shutdown - all operations halted, API keys locked")

    pdf.section_title("Using the Kill Switch", level=2)
    pdf.section_title("Activate (requires admin role):", level=3)
    pdf.code_block(
        'curl -X POST \\\n'
        '  -H "Authorization: Bearer <admin-token>" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"reason":"Emergency shutdown","scope":"all"}\' \\\n'
        '  http://localhost:3001/api/v1/killswitch/activate'
    )

    pdf.section_title("Check Status:", level=3)
    pdf.code_block(
        'curl -H "Authorization: Bearer <admin-token>" \\\n'
        '  http://localhost:3001/api/v1/killswitch/status'
    )

    pdf.section_title("Deactivate:", level=3)
    pdf.code_block(
        'curl -X POST \\\n'
        '  -H "Authorization: Bearer <admin-token>" \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"reason":"Issue resolved"}\' \\\n'
        '  http://localhost:3001/api/v1/killswitch/deactivate'
    )

    pdf.section_title("Automated Triggers", level=2)
    pdf.body_text("The kill switch can be automatically triggered by:")
    pdf.bullet("ROAS dropping below configured thresholds")
    pdf.bullet("Spend anomalies exceeding expected rates")
    pdf.bullet("Conversion tracking failures or pixel signal loss")
    pdf.bullet("CPC spikes beyond acceptable limits")
    pdf.bullet("API error storms (high error rates)")
    pdf.bullet("Fraud detection alerts")

    # =========================================================================
    # 10. OPTIMIZATION GUIDE
    # =========================================================================
    pdf.add_page()
    pdf.section_title("10. Optimization Guide")

    pdf.section_title("10.1 Agent Performance Optimization", level=2)
    pdf.bullet("Use Sonnet for routine sub-tasks: Route auxiliary operations (data formatting, simple lookups) to Sonnet instead of Opus. Sonnet is 5x cheaper and faster for these tasks.")
    pdf.bullet("Batch agent executions: When running multiple agents, use Promise.all() to execute independent agents in parallel rather than sequentially.")
    pdf.bullet("Tune confidence thresholds: Adjust the confidenceThreshold in agent configs. Lower thresholds (e.g., 60) allow more autonomous decisions; higher thresholds (e.g., 80) require more human review.")
    pdf.bullet("Limit cross-challenge rounds: The default MAX_CHALLENGE_ROUNDS is 5. For faster results with acceptable quality, reduce to 3 rounds.")
    pdf.bullet("Cache agent state: Agents persist state to the database. Ensure frequent-read state is also cached in Redis via cacheGet/cacheSet.")
    pdf.bullet("Monitor agent confidence drift: Track average confidence scores over time. Declining scores indicate data quality issues that need attention.")

    pdf.section_title("10.2 AI Cost Optimization", level=2)
    pdf.bullet("Monitor costs via the CostTracker: Use the cost breakdown endpoints to see per-agent, per-model costs. Set budget alerts when costs exceed thresholds.")
    pdf.bullet("Optimize prompt lengths: Shorter, more focused system prompts reduce input tokens. Each agent's getSystemPrompt() should be concise but complete.")
    pdf.bullet("Set appropriate maxTokens: Override the default 2048 max tokens for agents that need shorter responses. This prevents wasted output tokens.")
    pdf.bullet("Use temperature wisely: The default temperature is 0.7. For deterministic tasks (data analysis, compliance checks), use 0.3. For creative tasks (ad copy, content), use 0.8-0.9.")
    pdf.bullet("Track token usage trends: The ai_cost_tracking table stores per-request costs. Run weekly cost reports to identify expensive agents and optimize their prompts.")
    pdf.bullet("Implement cost guardrails: Set maximum daily/monthly spend limits on AI API calls. Use the kill switch to halt agent runs if costs spike unexpectedly.")

    pdf.section_title("10.3 Database Optimization", level=2)
    pdf.bullet("Connection pool tuning: Set DB_POOL_MIN=5 and DB_POOL_MAX=20 for production. Monitor pool usage and adjust based on concurrent request patterns.")
    pdf.bullet("Enable SSL: Set DB_SSL=true for production. Use managed database services with automatic failover.")
    pdf.bullet("Index maintenance: The migrations create indexes on frequently queried columns. Monitor slow queries and add indexes as needed.")
    pdf.bullet("Vacuum and analyze: Schedule regular VACUUM ANALYZE on large tables (agent_decisions, audit_logs, ai_cost_tracking) to maintain query performance.")
    pdf.bullet("Partition large tables: For tables exceeding 10M rows, consider time-based partitioning on created_at columns.")
    pdf.bullet("Connection timeout: The default connectionTimeoutMillis is 5000ms with idleTimeoutMillis at 30000ms. These are reasonable defaults but can be tuned.")

    pdf.section_title("10.4 Redis Cache Optimization", level=2)
    pdf.bullet("Memory policy: The production docker-compose uses allkeys-lru eviction with 256MB max memory. Increase for larger datasets.")
    pdf.bullet("Cache TTLs: Kill switch state: 10-30 seconds. Settings: 300 seconds. Rate limit state: 120 seconds. Adjust based on data volatility.")
    pdf.bullet("AOF persistence: Enabled by default for durability. For performance-critical setups, consider switching to RDB snapshots only.")
    pdf.bullet("Monitor hit rates: Track cache hit/miss ratios. Low hit rates indicate TTLs may be too short or cache keys need restructuring.")
    pdf.bullet("Pipeline commands: For bulk cache operations, use Redis pipelining to reduce round trips.")

    pdf.section_title("10.5 Frontend Performance", level=2)
    pdf.bullet("Lazy loading: All 23 pages are already lazy-loaded via React.lazy(). This ensures minimal initial bundle size.")
    pdf.bullet("Asset caching: Vite produces content-hashed filenames. The nginx config caches /assets/ for 1 year with immutable headers.")
    pdf.bullet("Gzip compression: Enabled in nginx at compression level 6 for text, CSS, JS, JSON, SVG, and font files.")
    pdf.bullet("API request deduplication: The useApi hook and QueryProvider prevent duplicate API calls for the same data.")
    pdf.bullet("Dark mode: CSS transitions are set to 200ms for smooth theme switching without re-renders.")
    pdf.bullet("Error boundaries: The ErrorBoundary component prevents individual page crashes from taking down the entire application.")

    pdf.section_title("10.6 Docker & Infrastructure", level=2)
    pdf.bullet("Multi-stage builds: Both server and UI Dockerfiles use 3-stage builds (deps -> build -> run) for minimal image size.")
    pdf.bullet("Non-root containers: Both containers run as non-root users (appuser:appgroup) for security.")
    pdf.bullet("Health checks: All 4 services have container-level health checks. Docker compose uses depends_on with condition: service_healthy to ensure proper startup order.")
    pdf.bullet("Shared memory: PostgreSQL is configured with 128MB shared memory (shm_size) for better query performance.")
    pdf.bullet("Signal handling: The server uses dumb-init for proper PID 1 signal handling and 30-second graceful shutdown timeout.")
    pdf.bullet("Horizontal scaling: Use docker compose --scale server=N to run multiple server instances behind a load balancer.")

    # =========================================================================
    # 11. MONITORING
    # =========================================================================
    pdf.add_page()
    pdf.section_title("11. Monitoring, Health Checks & Alerts")

    pdf.section_title("Health Check Endpoints", level=2)
    pdf.body_text("Four health check levels are available:")

    pdf.section_title("Basic Health (public, for load balancers):", level=3)
    pdf.code_block('curl http://localhost:3001/health\n# Returns: {"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0"}')

    pdf.section_title("Readiness Probe (for Kubernetes):", level=3)
    pdf.code_block('curl http://localhost:3001/health/ready\n# Returns: {"ready":true,"checks":{"postgresql":true,"redis":true}}')

    pdf.section_title("Liveness Probe:", level=3)
    pdf.code_block('curl http://localhost:3001/health/live\n# Returns: {"alive":true,"pid":...,"uptime":...}')

    pdf.section_title("Deep Health Check (admin-only, authenticated):", level=3)
    pdf.code_block('curl -H "Authorization: Bearer <admin-token>" http://localhost:3001/health/deep')
    pdf.body_text("The deep check verifies: PostgreSQL connection/latency/pool, Redis connection/latency/memory, "
                  "integration status, agent system health, final output availability, memory usage, and disk usage.")

    pdf.section_title("Monitoring Thresholds", level=2)
    pdf.bullet("PostgreSQL latency: Warning > 100ms, Critical > 500ms or down")
    pdf.bullet("Redis latency: Warning > 50ms, Critical > 200ms or down")
    pdf.bullet("Memory (heap): Warning > 80%, Critical > 95%")
    pdf.bullet("Disk usage: Warning > 80%, Critical > 95%")
    pdf.bullet("Agent confidence (avg): Warning < 70%, Critical < 50%")
    pdf.bullet("Final outputs: Warning < 6 deliverables, Critical = 0")

    pdf.section_title("Logging", level=2)
    pdf.body_text(
        "The server uses Winston for structured JSON logging. Log levels: debug, info, warn, error. "
        "Configure via LOG_LEVEL and LOG_FORMAT environment variables. Each agent has a child logger "
        "pre-tagged with its agent type and instance ID for easy filtering."
    )

    pdf.section_title("Alert Channels", level=2)
    pdf.bullet("Slack: Webhook integration for channel notifications")
    pdf.bullet("Email: SMTP-based alerts via the EmailChannel notification service")
    pdf.bullet("SMS: SMS alerts via the SmsChannel notification service")
    pdf.bullet("In-App: In-application notification center via the InAppChannel service")

    # =========================================================================
    # 12. TESTING
    # =========================================================================
    pdf.add_page()
    pdf.section_title("12. Testing - Running All Test Suites")

    pdf.section_title("Server Tests (Jest)", level=2)
    pdf.code_block(
        "cd server\n"
        "npm test                        # All server tests\n"
        "npm run test:unit               # Unit tests only (fast, no external deps)\n"
        "npm run test:integration        # Integration tests (requires PostgreSQL + Redis)\n"
        "npm run test:e2e                # End-to-end tests (requires full stack)\n"
        "npm test -- --coverage          # Tests with coverage report"
    )
    pdf.body_text("Server test categories:")
    pdf.bullet("Unit tests (tests/unit/): 19 agent tests, middleware tests, service tests covering all modules")
    pdf.bullet("Integration tests (tests/integration/): API endpoint tests, agent interaction tests, final output tests")
    pdf.bullet("E2E tests (tests/e2e/): Full workflow tests, system tests, validation tests")

    pdf.section_title("UI Tests (Vitest + Testing Library)", level=2)
    pdf.code_block(
        "cd ui\n"
        "npm test                        # All UI tests (single run)\n"
        "npm run test:watch              # Watch mode for development\n"
        "npm run test:coverage           # Tests with coverage report"
    )
    pdf.body_text("UI test categories:")
    pdf.bullet("Component tests: All 15 shared components (Card, DataTable, KPICard, Toast, etc.)")
    pdf.bullet("Layout tests: Header and Sidebar components")
    pdf.bullet("Page tests: All 23 pages with API mocking via MSW (Mock Service Worker)")
    pdf.bullet("Hook tests: useApi, useMediaQuery, useTheme, useThemeCustomization, useWebSocket")
    pdf.bullet("Context tests: AppContext provider")
    pdf.bullet("Integration tests: Page-API integration with MSW handlers")

    pdf.section_title("Linting", level=2)
    pdf.code_block(
        "cd server && npm run lint       # Lint server TypeScript\n"
        "cd ui && npm run lint           # Lint UI TypeScript/React"
    )

    # =========================================================================
    # 13. CI/CD
    # =========================================================================
    pdf.add_page()
    pdf.section_title("13. CI/CD Pipeline")
    pdf.body_text(
        "GitHub Actions runs on every push and pull request to the main branch. The pipeline is defined "
        "in .github/workflows/ci.yml with concurrency control to cancel duplicate runs."
    )
    pdf.body_text("Pipeline stages:")
    pdf.numbered_item(1, "Lint & Typecheck: ESLint and TypeScript compiler checks for both server and UI (runs in parallel)")
    pdf.numbered_item(2, "Server Tests: Full Jest suite with PostgreSQL 16 and Redis 7 service containers, coverage upload")
    pdf.numbered_item(3, "UI Tests: Vitest + Testing Library suite with coverage upload")
    pdf.numbered_item(4, "Build Verification: Confirms both server (dist/index.js) and UI (dist/index.html + assets) produce valid build artifacts")

    pdf.note_box(
        "Server tests and UI tests run in parallel after the lint stage passes. "
        "Build verification runs only after both test stages succeed.",
        "info"
    )

    # =========================================================================
    # 14. TROUBLESHOOTING
    # =========================================================================
    pdf.add_page()
    pdf.section_title("14. Troubleshooting Guide")

    issues = [
        ("Server fails to start with 'Invalid environment variables'",
         "In production, DATABASE_URL, JWT_SECRET, and ENCRYPTION_KEY are required. JWT_SECRET must be at least 32 characters. ENCRYPTION_KEY must be exactly 32 characters. Check your .env file or environment variables.",
         "NODE_ENV=production node -e \"require('./dist/config/env')\""),

        ("Database connection failure",
         "1) Verify PostgreSQL is running: pg_isready -h localhost -p 5432\n2) Check DATABASE_URL is correct in your .env\n3) If using SSL, ensure DB_SSL=true and certificates are valid\n4) Check connection pool limits (DB_POOL_MAX) are not exhausted",
         None),

        ("Redis connection failure",
         "1) Verify Redis is running: redis-cli ping\n2) Check REDIS_URL is correct\n3) If using TLS in production, verify certificate paths\n4) Check Redis memory: redis-cli info memory",
         None),

        ("Migrations fail",
         "1) Check PostgreSQL connectivity first\n2) Run verification: npx tsx src/migrations/verify.ts\n3) Check _migrations table for partially applied migrations\n4) Remove failed entry if needed: DELETE FROM _migrations WHERE filename = '<failed>'",
         None),

        ("AI agents not working",
         "1) Verify ANTHROPIC_API_KEY is set and valid\n2) Check if AI_ENABLED flag is true in the server logs\n3) Test the API key: check /health/deep endpoint for agent system status\n4) Monitor rate limits - the AI RateLimiter may be throttling requests",
         None),

        ("Agent confidence scores too low",
         "1) Review agent_decisions table for the specific agent type\n2) Check if input data quality is sufficient\n3) Review the cross-challenge findings for identified issues\n4) Ensure all required data sources are connected (integrations, Shopify, etc.)",
         None),

        ("Kill switch stuck active",
         "1) Check kill switch status: GET /api/v1/killswitch/status\n2) Deactivate via API: POST /api/v1/killswitch/deactivate\n3) Check kill_switch_state table directly if API is unresponsive\n4) Clear Redis cache: redis-cli DEL killswitch:active killswitch:current_level",
         None),

        ("High memory usage",
         "1) Check /health/deep for memory stats\n2) Reduce DB_POOL_MAX if idle connections are high\n3) Use PM2 with --max-memory-restart 1G for auto-restart\n4) Profile with --inspect flag for memory leak detection",
         None),

        ("UI not connecting to API",
         "1) Check CORS_ORIGINS includes your frontend URL\n2) Verify the nginx proxy configuration in nginx.conf\n3) Check that the server is running and healthy on port 3001\n4) In dev mode, ensure VITE_API_BASE is set correctly (defaults to /api)",
         None),
    ]

    for title, solution, cmd in issues:
        pdf.section_title(title, level=3)
        pdf.body_text(solution)
        if cmd:
            pdf.code_block(cmd)
        pdf.ln(2)

    # =========================================================================
    # 15. ENVIRONMENT VARIABLES
    # =========================================================================
    pdf.add_page()
    pdf.section_title("15. Environment Variables - Complete Reference")

    pdf.section_title("Application", level=2)
    env_vars = [
        ("NODE_ENV", "No", "development", "Runtime environment"),
        ("PORT", "No", "3001", "Server listen port"),
        ("API_PREFIX", "No", "/api/v1", "API route prefix"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("Database", level=2)
    env_vars = [
        ("DATABASE_URL", "Yes(prod)", "localhost", "PostgreSQL connection string"),
        ("DB_POOL_MIN", "No", "2", "Min pool connections"),
        ("DB_POOL_MAX", "No", "10", "Max pool connections"),
        ("DB_SSL", "No", "false", "Enable SSL for database"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("Redis", level=2)
    env_vars = [
        ("REDIS_URL", "No", "redis://localhost:6379", "Redis connection string"),
        ("REDIS_PASSWORD", "No", "--", "Redis auth password"),
        ("REDIS_DB", "No", "0", "Redis database number"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("Authentication & Security", level=2)
    env_vars = [
        ("JWT_SECRET", "Yes(prod)", "--", "JWT signing secret (min 32 chars)"),
        ("JWT_EXPIRES_IN", "No", "24h", "Access token TTL"),
        ("JWT_REFRESH_EXPIRES_IN", "No", "7d", "Refresh token TTL"),
        ("ENCRYPTION_KEY", "Yes(prod)", "--", "AES-256 key (exactly 32 chars)"),
        ("MFA_ISSUER", "No", "AIGrowthEngine", "TOTP issuer label"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("AI / Anthropic", level=2)
    env_vars = [
        ("ANTHROPIC_API_KEY", "No", "--", "Enables AI agent features"),
        ("ANTHROPIC_OPUS_MODEL", "No", "claude-opus-4-*", "Opus model identifier"),
        ("ANTHROPIC_SONNET_MODEL", "No", "claude-sonnet-4-*", "Sonnet model identifier"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("Rate Limiting", level=2)
    env_vars = [
        ("RATE_LIMIT_WINDOW_MS", "No", "900000", "Rate limit window (15 min)"),
        ("RATE_LIMIT_MAX_REQUESTS", "No", "100", "Max requests per window"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    pdf.section_title("Logging & CORS", level=2)
    env_vars = [
        ("LOG_LEVEL", "No", "info", "debug, info, warn, error"),
        ("LOG_FORMAT", "No", "json", "json or simple"),
        ("CORS_ORIGINS", "No", "localhost:5173", "Allowed origins (comma-sep)"),
    ]
    pdf.table_header(["Variable", "Required", "Default", "Description"])
    for v in env_vars:
        pdf.env_var_row(*v)

    # Save
    output_path = "/home/user/marketing/AI_Growth_Engine_Instructions.pdf"
    pdf.output(output_path)
    print(f"PDF generated: {output_path}")
    return output_path

if __name__ == "__main__":
    build_pdf()
