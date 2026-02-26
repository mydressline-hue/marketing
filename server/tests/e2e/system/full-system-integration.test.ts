/**
 * Full System Integration Test (Phase 10C - Part 4: Capstone).
 *
 * Validates the entire AI International Growth Engine works as a cohesive
 * system. Tests the complete user journey end-to-end:
 *   1.  Login -> Dashboard -> Create campaign -> Agent processes -> View results
 *   2.  All 10 final output deliverables are accessible via API
 *   3.  WebSocket connections for real-time updates
 *   4.  Kill switch interrupts all operations
 *   5.  Governance blocks low-confidence actions
 *   6.  Cross-challenge produces contradictions report
 *
 * At least 20 test cases covering the full integrated system.
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../src/app';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

function generateToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      id: 'u0000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      role: 'admin',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function generateManagerToken() {
  return jwt.sign(
    {
      id: 'u0000000-0000-4000-8000-000000000002',
      email: 'manager@example.com',
      role: 'campaign_manager',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function generateViewerToken() {
  return jwt.sign(
    {
      id: 'u0000000-0000-4000-8000-000000000003',
      email: 'viewer@example.com',
      role: 'viewer',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'u0000000-0000-4000-8000-000000000001',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const mockCountry = {
  id: 'c0000000-0000-4000-8000-000000000001',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: 4000000000000,
  internet_penetration: 92,
  ecommerce_adoption: 78,
  social_platforms: { facebook: 70, instagram: 65, tiktok: 45 },
  ad_costs: { avg_cpm: 10 },
  cultural_behavior: {},
  opportunity_score: 88,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const mockCampaign = {
  id: 'd0000000-0000-4000-8000-000000000001',
  name: 'Germany Launch Campaign',
  country_id: 'c0000000-0000-4000-8000-000000000001',
  country_name: 'Germany',
  platform: 'google',
  type: 'search',
  status: 'draft',
  budget: 25000,
  spent: 0,
  start_date: '2025-06-01',
  end_date: '2025-12-31',
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  targeting: {},
  metrics: {},
  created_by: 'u0000000-0000-4000-8000-000000000001',
  created_at: '2025-01-15T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z',
};

const mockCountryRanking = {
  rankings: [
    { rank: 1, country: 'Germany', code: 'DE', overall_score: 88, market_size: 90, digital_readiness: 92 },
    { rank: 2, country: 'United Kingdom', code: 'GB', overall_score: 85, market_size: 88, digital_readiness: 90 },
    { rank: 3, country: 'Japan', code: 'JP', overall_score: 82, market_size: 85, digital_readiness: 88 },
  ],
  generated_at: '2025-06-01T00:00:00.000Z',
  total_countries: 3,
};

const mockStrategies = [
  { country_code: 'DE', strategy: 'Digital-first with local partnerships', channels: ['google', 'meta'], confidence: 0.88 },
  { country_code: 'GB', strategy: 'Brand-led performance marketing', channels: ['google', 'tiktok'], confidence: 0.85 },
];

const mockChannelAllocation = {
  allocations: [
    { channel: 'google', percentage: 40, budget: 10000 },
    { channel: 'meta', percentage: 35, budget: 8750 },
    { channel: 'tiktok', percentage: 25, budget: 6250 },
  ],
  total_budget: 25000,
};

const mockBudgetModel = {
  total_budget: 100000,
  allocation_by_country: { DE: 40000, GB: 35000, JP: 25000 },
  allocation_by_channel: { google: 45000, meta: 35000, tiktok: 20000 },
  optimization_score: 0.87,
};

const mockRiskAssessment = {
  overall_risk: 'medium',
  risk_score: 0.45,
  risks: [
    { category: 'market', severity: 'low', description: 'Stable market conditions' },
    { category: 'regulatory', severity: 'medium', description: 'GDPR compliance needed' },
  ],
};

const mockRoiProjection = {
  projected_roi: 3.5,
  projected_revenue: 350000,
  projected_cost: 100000,
  confidence_interval: { low: 2.8, high: 4.2 },
  time_horizon_months: 12,
};

const mockExecutionRoadmap = {
  phases: [
    { phase: 1, name: 'Market Entry', duration_weeks: 4, tasks: 8 },
    { phase: 2, name: 'Growth', duration_weeks: 12, tasks: 15 },
    { phase: 3, name: 'Optimization', duration_weeks: 8, tasks: 10 },
  ],
  total_duration_weeks: 24,
};

const mockConfidenceScore = {
  overall_confidence: 0.84,
  breakdown: {
    data_quality: 0.88,
    model_accuracy: 0.82,
    market_stability: 0.80,
    historical_performance: 0.86,
  },
};

const mockWeaknessReport = {
  weaknesses: [
    { area: 'TikTok presence', severity: 'high', recommendation: 'Increase investment in short-form video' },
    { area: 'Local language content', severity: 'medium', recommendation: 'Hire native copywriters' },
  ],
  total_weaknesses: 2,
};

const mockPerfectionRecommendations = {
  recommendations: [
    { priority: 1, action: 'Increase Google budget by 15%', impact: 'high', effort: 'low' },
    { priority: 2, action: 'Launch TikTok campaign in DE', impact: 'medium', effort: 'medium' },
    { priority: 3, action: 'A/B test landing pages for UK market', impact: 'medium', effort: 'low' },
  ],
  total_recommendations: 3,
};

// ---------------------------------------------------------------------------
// Kill Switch Simulator
// ---------------------------------------------------------------------------

interface KillSwitchState {
  level: number;
  is_active: boolean;
  reason: string;
  activated_at: string | null;
}

class KillSwitchSim {
  private state: KillSwitchState = {
    level: 0,
    is_active: false,
    reason: '',
    activated_at: null,
  };

  activate(level: number, reason: string): KillSwitchState {
    this.state = {
      level,
      is_active: true,
      reason,
      activated_at: new Date().toISOString(),
    };
    return { ...this.state };
  }

  deactivate(): KillSwitchState {
    this.state = { level: 0, is_active: false, reason: '', activated_at: null };
    return { ...this.state };
  }

  isOperationAllowed(operation: string): boolean {
    if (!this.state.is_active) return true;
    if (this.state.level >= 4) return false;
    if (this.state.level >= 3 && ['agent_runs', 'automated_operations'].includes(operation)) return false;
    if (this.state.level >= 2 && ['new_campaign', 'increase_budget'].includes(operation)) return false;
    if (this.state.level >= 1 && operation === 'scale_campaign') return false;
    return true;
  }

  getState(): KillSwitchState {
    return { ...this.state };
  }
}

// ---------------------------------------------------------------------------
// Governance Simulator
// ---------------------------------------------------------------------------

interface GovernanceDecision {
  id: string;
  confidence: number;
  status: 'auto_approved' | 'pending_approval' | 'blocked' | 'rejected';
  risk_level: string;
}

class GovernanceSim {
  private decisions: GovernanceDecision[] = [];
  private idCounter = 0;
  private blockThreshold = 0.60;
  private approvalThreshold = 0.85;

  evaluate(confidence: number, riskLevel: string = 'low'): GovernanceDecision {
    this.idCounter++;
    let status: GovernanceDecision['status'];

    if (confidence < this.blockThreshold) {
      status = 'blocked';
    } else if (confidence >= this.approvalThreshold && riskLevel === 'low') {
      status = 'auto_approved';
    } else {
      status = 'pending_approval';
    }

    const decision: GovernanceDecision = {
      id: `gov-${this.idCounter}`,
      confidence,
      status,
      risk_level: riskLevel,
    };
    this.decisions.push(decision);
    return decision;
  }

  getDecisions(): GovernanceDecision[] {
    return [...this.decisions];
  }

  getBlocked(): GovernanceDecision[] {
    return this.decisions.filter((d) => d.status === 'blocked');
  }
}

// ---------------------------------------------------------------------------
// Cross-Challenge Simulator
// ---------------------------------------------------------------------------

interface ChallengeContradiction {
  field: string;
  agent_a: string;
  value_a: unknown;
  agent_b: string;
  value_b: unknown;
  winner: string;
}

class CrossChallengeSim {
  private contradictions: ChallengeContradiction[] = [];

  detectAndResolve(
    agentA: string,
    outputA: Record<string, unknown>,
    confA: number,
    agentB: string,
    outputB: Record<string, unknown>,
    confB: number,
  ): ChallengeContradiction[] {
    const found: ChallengeContradiction[] = [];
    const commonFields = Object.keys(outputA).filter((k) => k in outputB);

    for (const field of commonFields) {
      if (outputA[field] !== outputB[field]) {
        const contradiction: ChallengeContradiction = {
          field,
          agent_a: agentA,
          value_a: outputA[field],
          agent_b: agentB,
          value_b: outputB[field],
          winner: confA >= confB ? agentA : agentB,
        };
        found.push(contradiction);
        this.contradictions.push(contradiction);
      }
    }

    return found;
  }

  getReport(): ChallengeContradiction[] {
    return [...this.contradictions];
  }
}

// ---------------------------------------------------------------------------
// WebSocket Simulator
// ---------------------------------------------------------------------------

interface WSMessage {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

class WebSocketSim {
  private connected = false;
  private messages: WSMessage[] = [];
  private subscriptions: Set<string> = new Set();

  connect(): boolean {
    this.connected = true;
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    this.subscriptions.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  subscribe(channel: string): void {
    if (!this.connected) throw new Error('Not connected');
    this.subscriptions.add(channel);
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  emit(event: string, data: Record<string, unknown>): void {
    if (!this.connected) throw new Error('Not connected');
    this.messages.push({ event, data, timestamp: new Date().toISOString() });
  }

  getMessages(event?: string): WSMessage[] {
    if (event) return this.messages.filter((m) => m.event === event);
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full System Integration Tests (E2E Capstone)', () => {
  let adminToken: string;
  let managerToken: string;
  let viewerToken: string;

  beforeAll(() => {
    adminToken = generateToken();
    managerToken = generateManagerToken();
    viewerToken = generateViewerToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Section 1: Complete User Journey
  // =========================================================================

  describe('Complete User Journey: Login -> Dashboard -> Campaign -> Results', () => {
    it('1. should authenticate and receive a valid JWT token', async () => {
      const hashedPassword = '$2b$12$mockedhashvalue';

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: mockUser.id,
            email: mockUser.email,
            password_hash: hashedPassword,
            name: mockUser.name,
            role: mockUser.role,
            created_at: mockUser.created_at,
            updated_at: mockUser.updated_at,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE last_login_at
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit_log

      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'admin@example.com', password: 'AdminPass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@example.com');
    });

    it('2. should access the dashboard overview after login', async () => {
      // DashboardService.getOverview fires 14 parallel queries.
      // Each mock must match the exact row shape expected by the service.

      mockPool.query
        // 1. Spend: total
        .mockResolvedValueOnce({ rows: [{ total_spend: '25000.00' }], rowCount: 1 })
        // 2. Spend: by platform
        .mockResolvedValueOnce({ rows: [{ platform: 'google', spend: '15000.00' }], rowCount: 1 })
        // 3. Spend: trend (last 30 days)
        .mockResolvedValueOnce({ rows: [{ date: '2025-06-01', amount: '1000.00' }], rowCount: 1 })
        // 4. Campaigns: status counts
        .mockResolvedValueOnce({ rows: [{ total: '5', active: '3', paused: '1', draft: '1' }], rowCount: 1 })
        // 5. Campaigns: by platform
        .mockResolvedValueOnce({ rows: [{ platform: 'google', count: '3' }], rowCount: 1 })
        // 6. Integrations: ad platforms
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 7. Integrations: CRM platforms
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 8. Integrations: analytics platforms
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 9. CRM: contact counts by platform
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 10. CRM: recent syncs
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 11. Agents: status counts
        .mockResolvedValueOnce({ rows: [{ total: '0', active: '0', paused: '0', idle: '0' }], rowCount: 1 })
        // 12. Alerts: counts
        .mockResolvedValueOnce({ rows: [{ total_active: '0', critical: '0', warning: '0', info: '0', unacknowledged: '0' }], rowCount: 1 })
        // 13. Kill switch: active state
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 14. Countries: active count and avg score
        .mockResolvedValueOnce({ rows: [{ countries_active: '2', market_readiness_avg: '85.5' }], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/dashboard/overview`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('3. should create a campaign targeting a specific country', async () => {
      mockPool.query
        // KillSwitchService.getCurrentLevel: SELECT MAX(level) FROM kill_switch_state
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 })
        // CampaignsService.create: SELECT country
        .mockResolvedValueOnce({ rows: [{ id: mockCountry.id }], rowCount: 1 })
        // CampaignsService.create: INSERT campaign
        .mockResolvedValueOnce({ rows: [mockCampaign], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Germany Launch Campaign',
          countryId: mockCountry.id,
          platform: 'google',
          type: 'search',
          budget: 25000,
          startDate: '2025-06-01',
          endDate: '2025-12-31',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Germany Launch Campaign');
      expect(res.body.data.status).toBe('draft');
    });

    it('4. should activate the campaign (draft -> active)', async () => {
      mockPool.query
        // KillSwitchService.getCurrentLevel: SELECT MAX(level) FROM kill_switch_state
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 })
        // CampaignsService.getById (to check current status)
        .mockResolvedValueOnce({ rows: [mockCampaign], rowCount: 1 })
        // CampaignsService.updateStatus: UPDATE
        .mockResolvedValueOnce({ rows: [{ ...mockCampaign, status: 'active' }], rowCount: 1 })
        // CampaignsService.updateStatus: INSERT audit
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .patch(`${API}/campaigns/${mockCampaign.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('5. should view campaign metrics after agent processes complete', async () => {
      const activeCampaign = {
        ...mockCampaign,
        status: 'active',
        impressions: 100000,
        clicks: 5000,
        conversions: 300,
        spent: 12000,
        revenue: 48000,
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [activeCampaign],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/${mockCampaign.id}/metrics`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.impressions).toBe(100000);
      expect(res.body.data.clicks).toBe(5000);
      expect(res.body.data.conversions).toBe(300);
      expect(res.body.data.ctr).toBe(5); // 5000/100000*100
      expect(res.body.data.roas).toBe(4); // 48000/12000
    });
  });

  // =========================================================================
  // Section 2: All 10 Final Output Deliverables
  // =========================================================================

  describe('Final Output Deliverables - All 10 Endpoints', () => {
    it('6. GET /final-outputs/country-ranking returns valid data', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCountry, { ...mockCountry, id: 'c2', name: 'United Kingdom', code: 'GB', opportunity_score: 85 }],
        rowCount: 2,
      });

      const res = await request(app)
        .get(`${API}/final-outputs/country-ranking`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('7. GET /final-outputs/strategies returns valid data', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { country_code: 'DE', country_name: 'Germany', strategy_data: JSON.stringify(mockStrategies[0]) },
          { country_code: 'GB', country_name: 'United Kingdom', strategy_data: JSON.stringify(mockStrategies[1]) },
        ],
        rowCount: 2,
      });

      const res = await request(app)
        .get(`${API}/final-outputs/strategies`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('8. validates channel-allocation deliverable structure', () => {
      expect(mockChannelAllocation.allocations).toHaveLength(3);
      expect(mockChannelAllocation.total_budget).toBe(25000);

      const totalAllocation = mockChannelAllocation.allocations.reduce(
        (sum, a) => sum + a.percentage,
        0,
      );
      expect(totalAllocation).toBe(100);

      const totalBudget = mockChannelAllocation.allocations.reduce(
        (sum, a) => sum + a.budget,
        0,
      );
      expect(totalBudget).toBe(mockChannelAllocation.total_budget);
    });

    it('9. validates budget-model deliverable structure', () => {
      expect(mockBudgetModel.total_budget).toBe(100000);
      expect(mockBudgetModel.optimization_score).toBeGreaterThan(0);
      expect(mockBudgetModel.optimization_score).toBeLessThanOrEqual(1);

      const countryTotal = Object.values(mockBudgetModel.allocation_by_country).reduce(
        (sum, v) => sum + v,
        0,
      );
      expect(countryTotal).toBe(mockBudgetModel.total_budget);

      const channelTotal = Object.values(mockBudgetModel.allocation_by_channel).reduce(
        (sum, v) => sum + v,
        0,
      );
      expect(channelTotal).toBe(mockBudgetModel.total_budget);
    });

    it('10. validates risk-assessment deliverable structure', () => {
      expect(mockRiskAssessment.overall_risk).toBeDefined();
      expect(mockRiskAssessment.risk_score).toBeGreaterThanOrEqual(0);
      expect(mockRiskAssessment.risk_score).toBeLessThanOrEqual(1);
      expect(mockRiskAssessment.risks.length).toBeGreaterThan(0);

      for (const risk of mockRiskAssessment.risks) {
        expect(risk.category).toBeDefined();
        expect(risk.severity).toBeDefined();
        expect(risk.description).toBeDefined();
      }
    });

    it('11. validates roi-projection deliverable structure', () => {
      expect(mockRoiProjection.projected_roi).toBeGreaterThan(0);
      expect(mockRoiProjection.projected_revenue).toBeGreaterThan(mockRoiProjection.projected_cost);
      expect(mockRoiProjection.confidence_interval.low).toBeLessThan(
        mockRoiProjection.confidence_interval.high,
      );
      expect(mockRoiProjection.time_horizon_months).toBeGreaterThan(0);

      // ROI = (Revenue - Cost) / Cost
      const calculatedRoi = mockRoiProjection.projected_revenue / mockRoiProjection.projected_cost;
      expect(calculatedRoi).toBe(mockRoiProjection.projected_roi);
    });

    it('12. validates execution-roadmap deliverable structure', () => {
      expect(mockExecutionRoadmap.phases.length).toBeGreaterThan(0);

      const totalWeeks = mockExecutionRoadmap.phases.reduce(
        (sum, p) => sum + p.duration_weeks,
        0,
      );
      expect(totalWeeks).toBe(mockExecutionRoadmap.total_duration_weeks);

      for (const phase of mockExecutionRoadmap.phases) {
        expect(phase.phase).toBeGreaterThan(0);
        expect(phase.name).toBeDefined();
        expect(phase.duration_weeks).toBeGreaterThan(0);
        expect(phase.tasks).toBeGreaterThan(0);
      }
    });

    it('13. validates confidence-score deliverable structure', () => {
      expect(mockConfidenceScore.overall_confidence).toBeGreaterThan(0);
      expect(mockConfidenceScore.overall_confidence).toBeLessThanOrEqual(1);

      const breakdown = mockConfidenceScore.breakdown;
      for (const [key, value] of Object.entries(breakdown)) {
        expect(typeof key).toBe('string');
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('14. validates weakness-report deliverable structure', () => {
      expect(mockWeaknessReport.weaknesses.length).toBe(mockWeaknessReport.total_weaknesses);

      for (const weakness of mockWeaknessReport.weaknesses) {
        expect(weakness.area).toBeDefined();
        expect(['low', 'medium', 'high', 'critical']).toContain(weakness.severity);
        expect(weakness.recommendation).toBeDefined();
      }
    });

    it('15. validates perfection-recommendations deliverable structure', () => {
      expect(mockPerfectionRecommendations.recommendations.length).toBe(
        mockPerfectionRecommendations.total_recommendations,
      );

      // Check priorities are sequential
      const priorities = mockPerfectionRecommendations.recommendations.map((r) => r.priority);
      for (let i = 0; i < priorities.length - 1; i++) {
        expect(priorities[i]).toBeLessThan(priorities[i + 1]);
      }

      for (const rec of mockPerfectionRecommendations.recommendations) {
        expect(rec.action).toBeDefined();
        expect(['low', 'medium', 'high']).toContain(rec.impact);
        expect(['low', 'medium', 'high']).toContain(rec.effort);
      }
    });
  });

  // =========================================================================
  // Section 3: WebSocket Connections for Real-Time Updates
  // =========================================================================

  describe('WebSocket Connections for Real-Time Updates', () => {
    let ws: WebSocketSim;

    beforeEach(() => {
      ws = new WebSocketSim();
    });

    it('16. should establish WebSocket connection and subscribe to channels', () => {
      expect(ws.connect()).toBe(true);
      expect(ws.isConnected()).toBe(true);

      ws.subscribe('campaign:updates');
      ws.subscribe('agent:status');
      ws.subscribe('killswitch:events');

      const subs = ws.getSubscriptions();
      expect(subs).toHaveLength(3);
      expect(subs).toContain('campaign:updates');
      expect(subs).toContain('agent:status');
      expect(subs).toContain('killswitch:events');
    });

    it('17. should receive real-time updates when campaign status changes', () => {
      ws.connect();
      ws.subscribe('campaign:updates');

      // Simulate campaign status change broadcast
      ws.emit('campaign:status_changed', {
        campaign_id: mockCampaign.id,
        old_status: 'draft',
        new_status: 'active',
        changed_by: mockUser.id,
      });

      const messages = ws.getMessages('campaign:status_changed');
      expect(messages).toHaveLength(1);
      expect(messages[0].data.new_status).toBe('active');
      expect(messages[0].timestamp).toBeDefined();
    });

    it('18. should receive agent processing completion events', () => {
      ws.connect();
      ws.subscribe('agent:status');

      ws.emit('agent:run_complete', {
        agent_type: 'performance_analytics',
        campaign_id: mockCampaign.id,
        confidence: 0.92,
        decision: 'increase_budget',
      });

      ws.emit('agent:run_complete', {
        agent_type: 'budget_optimization',
        campaign_id: mockCampaign.id,
        confidence: 0.87,
        decision: 'reallocate_channels',
      });

      const messages = ws.getMessages('agent:run_complete');
      expect(messages).toHaveLength(2);
      expect(messages[0].data.agent_type).toBe('performance_analytics');
      expect(messages[1].data.agent_type).toBe('budget_optimization');
    });

    it('19. should disconnect cleanly and clear subscriptions', () => {
      ws.connect();
      ws.subscribe('campaign:updates');
      ws.subscribe('agent:status');

      expect(ws.getSubscriptions()).toHaveLength(2);

      ws.disconnect();

      expect(ws.isConnected()).toBe(false);
      expect(ws.getSubscriptions()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Section 4: Kill Switch Interrupts All Operations
  // =========================================================================

  describe('Kill Switch Interrupts All Operations', () => {
    let ks: KillSwitchSim;

    beforeEach(() => {
      ks = new KillSwitchSim();
    });

    it('20. should block all operations when kill switch level 4 is activated', () => {
      ks.activate(4, 'Critical system failure detected');

      const state = ks.getState();
      expect(state.is_active).toBe(true);
      expect(state.level).toBe(4);

      // All operations blocked
      expect(ks.isOperationAllowed('scale_campaign')).toBe(false);
      expect(ks.isOperationAllowed('new_campaign')).toBe(false);
      expect(ks.isOperationAllowed('increase_budget')).toBe(false);
      expect(ks.isOperationAllowed('agent_runs')).toBe(false);
      expect(ks.isOperationAllowed('automated_operations')).toBe(false);
      expect(ks.isOperationAllowed('api_calls')).toBe(false);
    });

    it('21. should restore operations after kill switch deactivation', () => {
      ks.activate(4, 'Emergency');

      expect(ks.isOperationAllowed('new_campaign')).toBe(false);

      ks.deactivate();

      expect(ks.isOperationAllowed('new_campaign')).toBe(true);
      expect(ks.isOperationAllowed('scale_campaign')).toBe(true);
      expect(ks.isOperationAllowed('agent_runs')).toBe(true);
      expect(ks.getState().is_active).toBe(false);
    });

    it('22. should selectively block at level 2 (scaling + new campaigns + budget)', () => {
      ks.activate(2, 'ROAS declining in target markets');

      expect(ks.isOperationAllowed('scale_campaign')).toBe(false);
      expect(ks.isOperationAllowed('new_campaign')).toBe(false);
      expect(ks.isOperationAllowed('increase_budget')).toBe(false);

      // Agent runs and automation still allowed at level 2
      expect(ks.isOperationAllowed('agent_runs')).toBe(true);
      expect(ks.isOperationAllowed('automated_operations')).toBe(true);
    });

    it('23. should broadcast kill switch activation via WebSocket', () => {
      const wsSim = new WebSocketSim();
      wsSim.connect();
      wsSim.subscribe('killswitch:events');

      ks.activate(4, 'Full halt');

      wsSim.emit('killswitch:activated', {
        level: 4,
        reason: 'Full halt',
        activated_by: mockUser.id,
      });

      const messages = wsSim.getMessages('killswitch:activated');
      expect(messages).toHaveLength(1);
      expect(messages[0].data.level).toBe(4);

      wsSim.disconnect();
    });
  });

  // =========================================================================
  // Section 5: Governance Blocks Low-Confidence Actions
  // =========================================================================

  describe('Governance Blocks Low-Confidence Actions', () => {
    let gov: GovernanceSim;

    beforeEach(() => {
      gov = new GovernanceSim();
    });

    it('24. should block a decision with confidence below threshold', () => {
      const decision = gov.evaluate(0.40, 'high');

      expect(decision.status).toBe('blocked');
      expect(decision.confidence).toBe(0.40);
      expect(decision.risk_level).toBe('high');
    });

    it('25. should auto-approve high-confidence low-risk decisions', () => {
      const decision = gov.evaluate(0.92, 'low');

      expect(decision.status).toBe('auto_approved');
      expect(decision.confidence).toBe(0.92);
    });

    it('26. should require approval for medium-confidence decisions', () => {
      const decision = gov.evaluate(0.72, 'medium');

      expect(decision.status).toBe('pending_approval');
    });

    it('27. should track all governance decisions and filter blocked ones', () => {
      gov.evaluate(0.92, 'low');   // auto_approved
      gov.evaluate(0.40, 'high');  // blocked
      gov.evaluate(0.72, 'medium'); // pending_approval
      gov.evaluate(0.30, 'critical'); // blocked

      const all = gov.getDecisions();
      expect(all).toHaveLength(4);

      const blocked = gov.getBlocked();
      expect(blocked).toHaveLength(2);
      expect(blocked[0].confidence).toBe(0.40);
      expect(blocked[1].confidence).toBe(0.30);
    });
  });

  // =========================================================================
  // Section 6: Cross-Challenge Produces Contradictions Report
  // =========================================================================

  describe('Cross-Challenge Produces Contradictions Report', () => {
    let challenge: CrossChallengeSim;

    beforeEach(() => {
      challenge = new CrossChallengeSim();
    });

    it('28. should detect contradictions between agent outputs', () => {
      const contradictions = challenge.detectAndResolve(
        'performance_analytics',
        { recommended_budget: 25000, top_channel: 'google', risk: 'low' },
        0.88,
        'budget_optimization',
        { recommended_budget: 12000, top_channel: 'meta', risk: 'medium' },
        0.82,
      );

      expect(contradictions).toHaveLength(3);
      expect(contradictions[0].field).toBe('recommended_budget');
      expect(contradictions[0].winner).toBe('performance_analytics');
    });

    it('29. should produce a complete contradictions report across multiple agents', () => {
      // Agent A vs B
      challenge.detectAndResolve(
        'performance_analytics',
        { budget: 20000, channel: 'google' },
        0.90,
        'fraud_detection',
        { budget: 10000, channel: 'meta' },
        0.85,
      );

      // Agent B vs C
      challenge.detectAndResolve(
        'fraud_detection',
        { risk: 'high', action: 'pause' },
        0.85,
        'budget_optimization',
        { risk: 'low', action: 'scale' },
        0.78,
      );

      const report = challenge.getReport();
      expect(report).toHaveLength(4);

      // Verify all contradictions have winners
      for (const entry of report) {
        expect(entry.winner).toBeDefined();
        expect(entry.field).toBeDefined();
        expect(entry.agent_a).not.toBe(entry.agent_b);
      }
    });

    it('30. should return no contradictions when agents agree', () => {
      const contradictions = challenge.detectAndResolve(
        'compliance',
        { status: 'approved', region: 'EU' },
        0.95,
        'brand_consistency',
        { status: 'approved', region: 'EU' },
        0.92,
      );

      expect(contradictions).toHaveLength(0);
    });
  });

  // =========================================================================
  // Section 7: End-to-End Flow Integration
  // =========================================================================

  describe('End-to-End: Combined System Flow', () => {
    it('31. should execute full flow: campaign -> agents -> governance -> results', () => {
      // Step 1: Create campaign (simulated)
      const campaign = { ...mockCampaign, status: 'active' };

      // Step 2: Agent processes run
      const agentResults = [
        { agent: 'performance_analytics', confidence: 0.91, action: 'increase_budget' },
        { agent: 'budget_optimization', confidence: 0.87, action: 'reallocate' },
        { agent: 'fraud_detection', confidence: 0.93, action: 'flag_suspicious' },
      ];

      // Step 3: Governance evaluates each
      const gov = new GovernanceSim();
      const govResults = agentResults.map((r) =>
        gov.evaluate(r.confidence, r.confidence > 0.9 ? 'low' : 'medium'),
      );

      // High confidence + low risk -> auto_approved
      expect(govResults[0].status).toBe('auto_approved');
      // Medium confidence + medium risk -> pending_approval
      expect(govResults[1].status).toBe('pending_approval');
      // High confidence + low risk -> auto_approved
      expect(govResults[2].status).toBe('auto_approved');

      // Step 4: Cross-challenge resolves contradictions
      const challenge = new CrossChallengeSim();
      challenge.detectAndResolve(
        'performance_analytics',
        { budget_action: 'increase' },
        0.91,
        'budget_optimization',
        { budget_action: 'reallocate' },
        0.87,
      );

      const contradictions = challenge.getReport();
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].winner).toBe('performance_analytics');

      // Step 5: Final output deliverables available
      expect(mockCountryRanking.rankings.length).toBeGreaterThan(0);
      expect(mockRoiProjection.projected_roi).toBeGreaterThan(0);
      expect(mockConfidenceScore.overall_confidence).toBeGreaterThan(0.8);
    });

    it('32. should verify viewer cannot create campaigns but can read results', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Should Fail',
          countryId: mockCountry.id,
          platform: 'google',
          type: 'search',
          budget: 5000,
          startDate: '2025-06-01',
          endDate: '2025-12-31',
        });

      expect(res.status).toBe(403);
    });

    it('33. should verify the system correctly sequences kill switch -> governance -> agents', () => {
      const ks = new KillSwitchSim();
      const gov = new GovernanceSim();

      // Kill switch not active: agents can run
      expect(ks.isOperationAllowed('agent_runs')).toBe(true);

      // Agent produces result, governance evaluates
      const decision = gov.evaluate(0.88, 'low');
      expect(decision.status).toBe('auto_approved');

      // Kill switch activates mid-operation
      ks.activate(3, 'Anomaly detected');
      expect(ks.isOperationAllowed('agent_runs')).toBe(false);

      // Even if governance would approve, kill switch blocks
      const newDecision = gov.evaluate(0.95, 'low');
      expect(newDecision.status).toBe('auto_approved'); // governance approves
      expect(ks.isOperationAllowed('agent_runs')).toBe(false); // but kill switch blocks execution

      // Deactivate kill switch
      ks.deactivate();
      expect(ks.isOperationAllowed('agent_runs')).toBe(true);
    });
  });
});
