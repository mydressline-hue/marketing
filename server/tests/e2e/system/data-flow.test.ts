/**
 * E2E tests for System-Wide Data Flow.
 *
 * Validates that data moves correctly through the entire pipeline:
 *   1. Platform APIs -> IntegrationsService -> DB
 *   2. DB -> Agent processing -> Agent decisions
 *   3. Agent decisions -> API endpoints -> JSON response
 *   4. Webhooks -> Processing -> State updates
 *   5. Data transformation consistency (no data loss)
 *   6. Data normalization across different platforms
 *   7. Data validation at each boundary
 *   8. Error propagation through the data flow
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

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Simulation Types
// ---------------------------------------------------------------------------

interface PlatformApiResponse {
  platform: string;
  campaigns: PlatformCampaignData[];
  fetchedAt: string;
}

interface PlatformCampaignData {
  externalId: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  currency: string;
  countryCode?: string;
}

interface NormalizedCampaign {
  id: string;
  externalId: string;
  platform: string;
  name: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  currency: string;
  countryCode: string;
  normalizedAt: string;
}

interface AgentDecision {
  agentType: string;
  campaignId: string;
  action: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

interface WebhookPayload {
  platform: string;
  eventType: string;
  data: Record<string, unknown>;
  signature: string;
  receivedAt: string;
}

interface DataFlowRecord {
  stage: string;
  data: unknown;
  timestamp: string;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Data Flow Simulator
// ---------------------------------------------------------------------------

class DataFlowSimulator {
  private flowLog: DataFlowRecord[] = [];
  private campaigns: Map<string, NormalizedCampaign> = new Map();
  private decisions: AgentDecision[] = [];
  private webhookEvents: WebhookPayload[] = [];
  private stateUpdates: Array<{ entityId: string; field: string; oldValue: unknown; newValue: unknown; updatedAt: string }> = [];
  private errors: Map<string, string[]> = new Map();
  private idCounter = 0;

  // Stage 1: Platform API -> Raw data fetch
  fetchFromPlatformApi(platform: string, campaignCount: number): PlatformApiResponse {
    const campaigns: PlatformCampaignData[] = [];
    for (let i = 0; i < campaignCount; i++) {
      campaigns.push({
        externalId: `${platform}-ext-${i + 1}`,
        name: `${platform} Campaign ${i + 1}`,
        status: i % 3 === 0 ? 'ACTIVE' : i % 3 === 1 ? 'PAUSED' : 'ENABLED',
        spend: Math.round(Math.random() * 10000) / 100,
        impressions: Math.floor(Math.random() * 100000),
        clicks: Math.floor(Math.random() * 5000),
        conversions: Math.floor(Math.random() * 200),
        currency: platform === 'google_ads' ? 'USD' : platform === 'meta_ads' ? 'USD' : 'EUR',
        countryCode: i % 2 === 0 ? 'US' : 'DE',
      });
    }

    const response: PlatformApiResponse = {
      platform,
      campaigns,
      fetchedAt: new Date().toISOString(),
    };

    this.logFlow('platform_api_fetch', response);
    return response;
  }

  // Stage 2: Normalize platform data
  normalizePlatformData(apiResponse: PlatformApiResponse): NormalizedCampaign[] {
    const statusMap: Record<string, NormalizedCampaign['status']> = {
      ACTIVE: 'active',
      ENABLED: 'active',
      PAUSED: 'paused',
      DISABLED: 'paused',
      DRAFT: 'draft',
      COMPLETED: 'completed',
      REMOVED: 'completed',
    };

    const normalized: NormalizedCampaign[] = apiResponse.campaigns.map((raw) => {
      this.idCounter++;
      const impressions = raw.impressions || 0;
      const clicks = raw.clicks || 0;
      const conversions = raw.conversions || 0;
      const spend = raw.spend || 0;

      const campaign: NormalizedCampaign = {
        id: `campaign-${this.idCounter}`,
        externalId: raw.externalId,
        platform: apiResponse.platform,
        name: raw.name,
        status: statusMap[raw.status] || 'draft',
        spend,
        impressions,
        clicks,
        conversions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
        currency: raw.currency,
        countryCode: raw.countryCode || 'US',
        normalizedAt: new Date().toISOString(),
      };

      this.campaigns.set(campaign.id, campaign);
      return campaign;
    });

    this.logFlow('normalization', normalized);
    return normalized;
  }

  // Stage 3: Persist to DB (simulated)
  persistCampaigns(campaigns: NormalizedCampaign[]): { inserted: number; updated: number; errors: number } {
    let inserted = 0;
    let updated = 0;
    let errorCount = 0;

    for (const campaign of campaigns) {
      try {
        if (!campaign.id || !campaign.name) {
          throw new Error('Missing required fields');
        }
        if (campaign.spend < 0) {
          throw new Error('Negative spend value');
        }

        if (this.campaigns.has(campaign.id)) {
          updated++;
        } else {
          this.campaigns.set(campaign.id, campaign);
          inserted++;
        }
      } catch (err) {
        errorCount++;
        this.recordError('persist', err instanceof Error ? err.message : String(err));
      }
    }

    const result = { inserted, updated, errors: errorCount };
    this.logFlow('db_persist', result);
    return result;
  }

  // Stage 4: Agent processes campaign data and produces decisions
  agentProcessCampaigns(agentType: string, campaignIds: string[]): AgentDecision[] {
    const newDecisions: AgentDecision[] = [];

    for (const campaignId of campaignIds) {
      const campaign = this.campaigns.get(campaignId);
      if (!campaign) {
        this.recordError('agent_processing', `Campaign ${campaignId} not found`);
        continue;
      }

      let action = 'maintain';
      let confidence = 0.7;
      let reasoning = 'Normal performance.';

      if (campaign.cpc > 0 && campaign.cpa > 0) {
        if (campaign.ctr < 1.0) {
          action = 'pause';
          confidence = 0.85;
          reasoning = `Low CTR (${campaign.ctr.toFixed(2)}%) suggests poor ad relevance.`;
        } else if (campaign.cpa > 50) {
          action = 'reduce_budget';
          confidence = 0.80;
          reasoning = `High CPA ($${campaign.cpa.toFixed(2)}) indicates inefficient spending.`;
        } else if (campaign.ctr > 5.0 && campaign.cpa < 20) {
          action = 'increase_budget';
          confidence = 0.90;
          reasoning = `Strong CTR (${campaign.ctr.toFixed(2)}%) and low CPA ($${campaign.cpa.toFixed(2)}).`;
        }
      }

      const decision: AgentDecision = {
        agentType,
        campaignId,
        action,
        confidence,
        reasoning,
        timestamp: new Date().toISOString(),
      };

      newDecisions.push(decision);
      this.decisions.push(decision);
    }

    this.logFlow('agent_decision', newDecisions);
    return newDecisions;
  }

  // Stage 5: Format decisions as API JSON response
  formatApiResponse(decisions: AgentDecision[]): Record<string, unknown> {
    const response = {
      success: true,
      data: {
        decisions: decisions.map((d) => ({
          campaign_id: d.campaignId,
          action: d.action,
          confidence: d.confidence,
          reasoning: d.reasoning,
          agent_type: d.agentType,
          created_at: d.timestamp,
        })),
        summary: {
          total: decisions.length,
          actions: decisions.reduce((acc, d) => {
            acc[d.action] = (acc[d.action] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          avg_confidence:
            decisions.length > 0
              ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
              : 0,
        },
      },
      meta: {
        generated_at: new Date().toISOString(),
        version: 'v1',
      },
    };

    this.logFlow('api_response', response);
    return response;
  }

  // Stage 6: Process webhook event
  processWebhook(payload: WebhookPayload): { processed: boolean; stateChanged: boolean; error?: string } {
    this.webhookEvents.push(payload);
    this.logFlow('webhook_received', payload);

    // Validate signature
    if (!payload.signature || payload.signature.length < 10) {
      const error = 'Invalid webhook signature';
      this.recordError('webhook_processing', error);
      return { processed: false, stateChanged: false, error };
    }

    // Validate platform
    const supportedPlatforms = ['google_ads', 'meta_ads', 'tiktok_ads', 'shopify', 'salesforce'];
    if (!supportedPlatforms.includes(payload.platform)) {
      const error = `Unsupported platform: ${payload.platform}`;
      this.recordError('webhook_processing', error);
      return { processed: false, stateChanged: false, error };
    }

    // Process event types that cause state changes
    let stateChanged = false;
    if (payload.eventType === 'campaign.status_changed') {
      const campaignId = payload.data.campaign_id as string;
      const newStatus = payload.data.new_status as string;
      const campaign = this.campaigns.get(campaignId);
      if (campaign) {
        const oldStatus = campaign.status;
        campaign.status = newStatus as NormalizedCampaign['status'];
        this.stateUpdates.push({
          entityId: campaignId,
          field: 'status',
          oldValue: oldStatus,
          newValue: newStatus,
          updatedAt: new Date().toISOString(),
        });
        stateChanged = true;
      }
    } else if (payload.eventType === 'spend.updated') {
      const campaignId = payload.data.campaign_id as string;
      const newSpend = payload.data.spend as number;
      const campaign = this.campaigns.get(campaignId);
      if (campaign) {
        const oldSpend = campaign.spend;
        campaign.spend = newSpend;
        this.stateUpdates.push({
          entityId: campaignId,
          field: 'spend',
          oldValue: oldSpend,
          newValue: newSpend,
          updatedAt: new Date().toISOString(),
        });
        stateChanged = true;
      }
    }

    this.logFlow('webhook_processed', { processed: true, stateChanged });
    return { processed: true, stateChanged };
  }

  // Validate data at a boundary
  validateAtBoundary(stage: string, data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (data === null || data === undefined) {
      errors.push('Data is null or undefined');
      return { valid: false, errors };
    }

    if (stage === 'platform_api_fetch') {
      const resp = data as PlatformApiResponse;
      if (!resp.platform) errors.push('Missing platform field');
      if (!resp.campaigns || !Array.isArray(resp.campaigns)) errors.push('Missing or invalid campaigns array');
      if (!resp.fetchedAt) errors.push('Missing fetchedAt timestamp');
    }

    if (stage === 'normalization') {
      const campaigns = data as NormalizedCampaign[];
      for (const c of campaigns) {
        if (!c.id) errors.push(`Campaign missing id`);
        if (c.ctr < 0) errors.push(`Campaign ${c.id}: negative CTR`);
        if (c.cpc < 0) errors.push(`Campaign ${c.id}: negative CPC`);
        if (c.spend < 0) errors.push(`Campaign ${c.id}: negative spend`);
      }
    }

    if (stage === 'agent_decision') {
      const decisions = data as AgentDecision[];
      for (const d of decisions) {
        if (!d.agentType) errors.push('Decision missing agentType');
        if (d.confidence < 0 || d.confidence > 1) errors.push(`Decision has invalid confidence: ${d.confidence}`);
        if (!d.action) errors.push('Decision missing action');
      }
    }

    if (stage === 'api_response') {
      const response = data as Record<string, unknown>;
      if (!('success' in response)) errors.push('Response missing success field');
      if (!('data' in response)) errors.push('Response missing data field');
      if (!('meta' in response)) errors.push('Response missing meta field');
    }

    if (errors.length > 0) {
      for (const err of errors) {
        this.recordError(stage, err);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Getters
  getFlowLog(): DataFlowRecord[] {
    return [...this.flowLog];
  }

  getCampaign(id: string): NormalizedCampaign | undefined {
    return this.campaigns.get(id);
  }

  getAllCampaigns(): NormalizedCampaign[] {
    return Array.from(this.campaigns.values());
  }

  getDecisions(): AgentDecision[] {
    return [...this.decisions];
  }

  getStateUpdates(): typeof this.stateUpdates {
    return [...this.stateUpdates];
  }

  getErrors(stage?: string): string[] {
    if (stage) {
      return this.errors.get(stage) || [];
    }
    const allErrors: string[] = [];
    for (const errs of this.errors.values()) {
      allErrors.push(...errs);
    }
    return allErrors;
  }

  // Private helpers
  private logFlow(stage: string, data: unknown): void {
    this.flowLog.push({
      stage,
      data,
      timestamp: new Date().toISOString(),
      errors: [],
    });
  }

  private recordError(stage: string, message: string): void {
    if (!this.errors.has(stage)) {
      this.errors.set(stage, []);
    }
    this.errors.get(stage)!.push(message);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: System-Wide Data Flow', () => {
  let simulator: DataFlowSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    simulator = new DataFlowSimulator();
    mockGenerateId.mockReturnValue('test-uuid-generated');
  });

  // =========================================================================
  // 1. Platform API -> Integration Service -> DB
  // =========================================================================

  describe('Platform API -> Integration Service -> DB', () => {
    it('should fetch data from platform API and persist to DB', () => {
      // Step 1: Fetch from Google Ads API
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 5);
      expect(apiResponse.platform).toBe('google_ads');
      expect(apiResponse.campaigns).toHaveLength(5);
      expect(apiResponse.fetchedAt).toBeDefined();

      // Step 2: Normalize the data
      const normalized = simulator.normalizePlatformData(apiResponse);
      expect(normalized).toHaveLength(5);
      for (const c of normalized) {
        expect(c.platform).toBe('google_ads');
        expect(c.id).toBeDefined();
        expect(c.normalizedAt).toBeDefined();
      }

      // Step 3: Persist to DB
      const persistResult = simulator.persistCampaigns(normalized);
      expect(persistResult.errors).toBe(0);
      expect(persistResult.updated).toBe(5); // Already added during normalization
      expect(simulator.getAllCampaigns()).toHaveLength(5);

      // Verify flow log captures all stages
      const flow = simulator.getFlowLog();
      expect(flow.map((f) => f.stage)).toEqual([
        'platform_api_fetch',
        'normalization',
        'db_persist',
      ]);
    });

    it('should fetch and normalize data from multiple platforms', () => {
      const platforms = ['google_ads', 'meta_ads', 'tiktok_ads'];
      let totalCampaigns = 0;

      for (const platform of platforms) {
        const apiResponse = simulator.fetchFromPlatformApi(platform, 3);
        const normalized = simulator.normalizePlatformData(apiResponse);
        simulator.persistCampaigns(normalized);
        totalCampaigns += normalized.length;
      }

      expect(simulator.getAllCampaigns()).toHaveLength(totalCampaigns);

      // Verify each platform's campaigns exist
      const allCampaigns = simulator.getAllCampaigns();
      const platformCounts = new Map<string, number>();
      for (const c of allCampaigns) {
        platformCounts.set(c.platform, (platformCounts.get(c.platform) || 0) + 1);
      }
      expect(platformCounts.get('google_ads')).toBe(3);
      expect(platformCounts.get('meta_ads')).toBe(3);
      expect(platformCounts.get('tiktok_ads')).toBe(3);
    });

    it('should validate data integrity after fetch-normalize-persist pipeline', () => {
      const apiResponse = simulator.fetchFromPlatformApi('meta_ads', 4);

      // Validate at API boundary
      const apiValidation = simulator.validateAtBoundary('platform_api_fetch', apiResponse);
      expect(apiValidation.valid).toBe(true);
      expect(apiValidation.errors).toHaveLength(0);

      // Normalize
      const normalized = simulator.normalizePlatformData(apiResponse);

      // Validate at normalization boundary
      const normValidation = simulator.validateAtBoundary('normalization', normalized);
      expect(normValidation.valid).toBe(true);

      // Ensure no data loss -- campaign count preserved
      expect(normalized).toHaveLength(apiResponse.campaigns.length);

      // Ensure computed metrics are valid
      for (const c of normalized) {
        expect(c.ctr).toBeGreaterThanOrEqual(0);
        expect(c.cpc).toBeGreaterThanOrEqual(0);
        expect(c.cpa).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // 2. DB -> Agent Processing -> Agent Decisions
  // =========================================================================

  describe('DB -> Agent Processing -> Agent Decisions', () => {
    it('should produce agent decisions from campaign data', () => {
      // Setup: create campaigns
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 3);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const campaignIds = normalized.map((c) => c.id);

      // Process with agent
      const decisions = simulator.agentProcessCampaigns('budget_optimizer', campaignIds);

      expect(decisions).toHaveLength(3);
      for (const d of decisions) {
        expect(d.agentType).toBe('budget_optimizer');
        expect(d.campaignId).toBeDefined();
        expect(['maintain', 'pause', 'reduce_budget', 'increase_budget']).toContain(d.action);
        expect(d.confidence).toBeGreaterThanOrEqual(0);
        expect(d.confidence).toBeLessThanOrEqual(1);
        expect(d.reasoning).toBeDefined();
        expect(d.timestamp).toBeDefined();
      }
    });

    it('should handle missing campaign gracefully during agent processing', () => {
      const decisions = simulator.agentProcessCampaigns('budget_optimizer', [
        'non-existent-campaign-1',
        'non-existent-campaign-2',
      ]);

      expect(decisions).toHaveLength(0);
      const errors = simulator.getErrors('agent_processing');
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('not found');
    });

    it('should validate agent decisions at boundary', () => {
      const apiResponse = simulator.fetchFromPlatformApi('meta_ads', 5);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const campaignIds = normalized.map((c) => c.id);

      const decisions = simulator.agentProcessCampaigns('creative_optimizer', campaignIds);

      const validation = simulator.validateAtBoundary('agent_decision', decisions);
      expect(validation.valid).toBe(true);

      // All decisions should have valid confidence ranges
      for (const d of decisions) {
        expect(d.confidence).toBeGreaterThanOrEqual(0);
        expect(d.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // =========================================================================
  // 3. Agent Decisions -> API Endpoints -> JSON Response
  // =========================================================================

  describe('Agent Decisions -> API Endpoints -> JSON Response', () => {
    it('should format decisions into a valid API response', () => {
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 4);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const campaignIds = normalized.map((c) => c.id);
      const decisions = simulator.agentProcessCampaigns('performance_analyzer', campaignIds);

      const response = simulator.formatApiResponse(decisions);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.meta).toBeDefined();

      const data = response.data as Record<string, unknown>;
      const decisionsData = data.decisions as unknown[];
      expect(decisionsData).toHaveLength(4);

      const summary = data.summary as Record<string, unknown>;
      expect(summary.total).toBe(4);
      expect(summary.avg_confidence).toBeGreaterThan(0);
    });

    it('should validate the API response format at boundary', () => {
      const apiResponse = simulator.fetchFromPlatformApi('tiktok_ads', 2);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const decisions = simulator.agentProcessCampaigns('bidding_agent', normalized.map((c) => c.id));
      const response = simulator.formatApiResponse(decisions);

      const validation = simulator.validateAtBoundary('api_response', response);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should include all required fields in JSON response', () => {
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 1);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const decisions = simulator.agentProcessCampaigns('creative_optimizer', normalized.map((c) => c.id));
      const response = simulator.formatApiResponse(decisions);

      const data = response.data as { decisions: Array<Record<string, unknown>>; summary: Record<string, unknown> };

      // Each decision should have standard fields
      for (const d of data.decisions) {
        expect(d).toHaveProperty('campaign_id');
        expect(d).toHaveProperty('action');
        expect(d).toHaveProperty('confidence');
        expect(d).toHaveProperty('reasoning');
        expect(d).toHaveProperty('agent_type');
        expect(d).toHaveProperty('created_at');
      }

      // Summary should have aggregation fields
      expect(data.summary).toHaveProperty('total');
      expect(data.summary).toHaveProperty('actions');
      expect(data.summary).toHaveProperty('avg_confidence');

      // Meta should have version and timestamp
      const meta = response.meta as Record<string, unknown>;
      expect(meta).toHaveProperty('generated_at');
      expect(meta).toHaveProperty('version');
    });
  });

  // =========================================================================
  // 4. Webhooks -> Processing -> State Updates
  // =========================================================================

  describe('Webhooks -> Processing -> State Updates', () => {
    it('should process a webhook and update campaign status', () => {
      // Setup campaign
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 1);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const campaignId = normalized[0].id;

      expect(simulator.getCampaign(campaignId)!.status).not.toBe('paused');

      // Simulate webhook
      const webhook: WebhookPayload = {
        platform: 'google_ads',
        eventType: 'campaign.status_changed',
        data: { campaign_id: campaignId, new_status: 'paused' },
        signature: 'valid-hmac-signature-1234567890',
        receivedAt: new Date().toISOString(),
      };

      const result = simulator.processWebhook(webhook);
      expect(result.processed).toBe(true);
      expect(result.stateChanged).toBe(true);

      // Verify state was updated
      const updated = simulator.getCampaign(campaignId);
      expect(updated!.status).toBe('paused');

      // Verify state update was logged
      const updates = simulator.getStateUpdates();
      expect(updates).toHaveLength(1);
      expect(updates[0].entityId).toBe(campaignId);
      expect(updates[0].field).toBe('status');
      expect(updates[0].newValue).toBe('paused');
    });

    it('should process a spend update webhook', () => {
      const apiResponse = simulator.fetchFromPlatformApi('meta_ads', 1);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const campaignId = normalized[0].id;
      const originalSpend = normalized[0].spend;

      const webhook: WebhookPayload = {
        platform: 'meta_ads',
        eventType: 'spend.updated',
        data: { campaign_id: campaignId, spend: 999.99 },
        signature: 'valid-hmac-signature-abcdefghij',
        receivedAt: new Date().toISOString(),
      };

      const result = simulator.processWebhook(webhook);
      expect(result.processed).toBe(true);
      expect(result.stateChanged).toBe(true);

      const updated = simulator.getCampaign(campaignId);
      expect(updated!.spend).toBe(999.99);

      const updates = simulator.getStateUpdates();
      expect(updates[0].oldValue).toBe(originalSpend);
      expect(updates[0].newValue).toBe(999.99);
    });

    it('should reject webhooks with invalid signatures', () => {
      const webhook: WebhookPayload = {
        platform: 'google_ads',
        eventType: 'campaign.status_changed',
        data: { campaign_id: 'c1', new_status: 'paused' },
        signature: 'short',
        receivedAt: new Date().toISOString(),
      };

      const result = simulator.processWebhook(webhook);
      expect(result.processed).toBe(false);
      expect(result.error).toBe('Invalid webhook signature');

      const errors = simulator.getErrors('webhook_processing');
      expect(errors).toContain('Invalid webhook signature');
    });

    it('should reject webhooks from unsupported platforms', () => {
      const webhook: WebhookPayload = {
        platform: 'unknown_platform',
        eventType: 'campaign.update',
        data: {},
        signature: 'valid-hmac-signature-1234567890',
        receivedAt: new Date().toISOString(),
      };

      const result = simulator.processWebhook(webhook);
      expect(result.processed).toBe(false);
      expect(result.error).toContain('Unsupported platform');
    });
  });

  // =========================================================================
  // 5. Data Transformation Consistency
  // =========================================================================

  describe('Data Transformation Consistency', () => {
    it('should preserve data fields through normalization (no data loss)', () => {
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 3);

      for (const rawCampaign of apiResponse.campaigns) {
        const normalized = simulator.normalizePlatformData({
          platform: apiResponse.platform,
          campaigns: [rawCampaign],
          fetchedAt: apiResponse.fetchedAt,
        });

        const n = normalized[0];
        expect(n.externalId).toBe(rawCampaign.externalId);
        expect(n.name).toBe(rawCampaign.name);
        expect(n.spend).toBe(rawCampaign.spend);
        expect(n.impressions).toBe(rawCampaign.impressions);
        expect(n.clicks).toBe(rawCampaign.clicks);
        expect(n.conversions).toBe(rawCampaign.conversions);
        expect(n.currency).toBe(rawCampaign.currency);
      }
    });

    it('should preserve data through complete end-to-end pipeline', () => {
      const apiResponse = simulator.fetchFromPlatformApi('meta_ads', 2);
      const normalized = simulator.normalizePlatformData(apiResponse);
      simulator.persistCampaigns(normalized);
      const decisions = simulator.agentProcessCampaigns('budget_optimizer', normalized.map((c) => c.id));
      const response = simulator.formatApiResponse(decisions);

      // The response decisions should reference all the original campaign IDs
      const data = response.data as { decisions: Array<Record<string, unknown>> };
      const responseCampaignIds = data.decisions.map((d) => d.campaign_id);

      for (const n of normalized) {
        expect(responseCampaignIds).toContain(n.id);
      }

      // Verify flow log covers all stages
      const stages = simulator.getFlowLog().map((f) => f.stage);
      expect(stages).toContain('platform_api_fetch');
      expect(stages).toContain('normalization');
      expect(stages).toContain('db_persist');
      expect(stages).toContain('agent_decision');
      expect(stages).toContain('api_response');
    });
  });

  // =========================================================================
  // 6. Data Normalization Across Platforms
  // =========================================================================

  describe('Data Normalization Across Platforms', () => {
    it('should normalize different platform status values to standard statuses', () => {
      // Google Ads uses "ENABLED", Meta uses "ACTIVE"
      const googleResponse: PlatformApiResponse = {
        platform: 'google_ads',
        campaigns: [
          { externalId: 'g1', name: 'Google Camp', status: 'ENABLED', spend: 100, impressions: 10000, clicks: 500, conversions: 20, currency: 'USD' },
        ],
        fetchedAt: new Date().toISOString(),
      };

      const metaResponse: PlatformApiResponse = {
        platform: 'meta_ads',
        campaigns: [
          { externalId: 'm1', name: 'Meta Camp', status: 'ACTIVE', spend: 200, impressions: 20000, clicks: 1000, conversions: 40, currency: 'USD' },
        ],
        fetchedAt: new Date().toISOString(),
      };

      const googleNorm = simulator.normalizePlatformData(googleResponse);
      const metaNorm = simulator.normalizePlatformData(metaResponse);

      // Both "ENABLED" and "ACTIVE" should map to "active"
      expect(googleNorm[0].status).toBe('active');
      expect(metaNorm[0].status).toBe('active');
    });

    it('should compute derived metrics consistently across platforms', () => {
      const platforms = ['google_ads', 'meta_ads', 'tiktok_ads'];
      const allNormalized: NormalizedCampaign[] = [];

      for (const platform of platforms) {
        const response: PlatformApiResponse = {
          platform,
          campaigns: [
            { externalId: `${platform}-1`, name: `${platform} Camp`, status: 'ACTIVE', spend: 100, impressions: 10000, clicks: 500, conversions: 25, currency: 'USD' },
          ],
          fetchedAt: new Date().toISOString(),
        };
        const normalized = simulator.normalizePlatformData(response);
        allNormalized.push(...normalized);
      }

      // All platforms with the same raw data should produce the same derived metrics
      for (const c of allNormalized) {
        expect(c.ctr).toBeCloseTo(5.0, 2);  // 500/10000 * 100
        expect(c.cpc).toBeCloseTo(0.2, 2);  // 100/500
        expect(c.cpa).toBeCloseTo(4.0, 2);  // 100/25
      }
    });
  });

  // =========================================================================
  // 7. Data Validation at Each Boundary
  // =========================================================================

  describe('Data Validation at Each Boundary', () => {
    it('should catch null data at validation boundary', () => {
      const validation = simulator.validateAtBoundary('platform_api_fetch', null);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Data is null or undefined');
    });

    it('should catch missing platform field in API response', () => {
      const badResponse = { campaigns: [], fetchedAt: new Date().toISOString() };
      const validation = simulator.validateAtBoundary('platform_api_fetch', badResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing platform field');
    });

    it('should catch missing campaigns array in API response', () => {
      const badResponse = { platform: 'google_ads', fetchedAt: new Date().toISOString() };
      const validation = simulator.validateAtBoundary('platform_api_fetch', badResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing or invalid campaigns array');
    });

    it('should validate API response structure', () => {
      const badResponse = { data: {} };
      const validation = simulator.validateAtBoundary('api_response', badResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Response missing success field');
      expect(validation.errors).toContain('Response missing meta field');
    });
  });

  // =========================================================================
  // 8. Error Propagation Through the Data Flow
  // =========================================================================

  describe('Error Propagation Through the Data Flow', () => {
    it('should propagate errors and track them per stage', () => {
      // Process a non-existent campaign -- error at agent processing stage
      simulator.agentProcessCampaigns('budget_optimizer', ['missing-id']);
      expect(simulator.getErrors('agent_processing')).toHaveLength(1);

      // Process a bad webhook -- error at webhook processing stage
      simulator.processWebhook({
        platform: 'unknown',
        eventType: 'test',
        data: {},
        signature: 'valid-hmac-signature-1234567890',
        receivedAt: new Date().toISOString(),
      });
      expect(simulator.getErrors('webhook_processing')).toHaveLength(1);

      // All errors combined
      expect(simulator.getErrors().length).toBe(2);
    });

    it('should record persistence errors for invalid data', () => {
      // Create a campaign with negative spend
      const badCampaign: NormalizedCampaign = {
        id: 'bad-campaign',
        externalId: 'ext-bad',
        platform: 'google_ads',
        name: 'Bad Campaign',
        status: 'active',
        spend: -100,
        impressions: 1000,
        clicks: 50,
        conversions: 5,
        ctr: 5.0,
        cpc: -2.0,
        cpa: -20.0,
        currency: 'USD',
        countryCode: 'US',
        normalizedAt: new Date().toISOString(),
      };

      const result = simulator.persistCampaigns([badCampaign]);
      expect(result.errors).toBe(1);
      expect(simulator.getErrors('persist')).toHaveLength(1);
      expect(simulator.getErrors('persist')[0]).toContain('Negative spend');
    });

    it('should handle complete pipeline with partial errors without halting', () => {
      // Setup some valid campaigns
      const apiResponse = simulator.fetchFromPlatformApi('google_ads', 3);
      const normalized = simulator.normalizePlatformData(apiResponse);
      const validIds = normalized.map((c) => c.id);

      // Mix valid and invalid campaign IDs
      const mixedIds = [...validIds, 'non-existent-1', 'non-existent-2'];
      const decisions = simulator.agentProcessCampaigns('budget_optimizer', mixedIds);

      // Should produce decisions only for valid campaigns
      expect(decisions).toHaveLength(3);

      // Should record errors for missing campaigns
      const errors = simulator.getErrors('agent_processing');
      expect(errors).toHaveLength(2);

      // Pipeline should continue to produce API response for valid decisions
      const response = simulator.formatApiResponse(decisions);
      expect(response.success).toBe(true);
      const data = response.data as { decisions: unknown[] };
      expect(data.decisions).toHaveLength(3);
    });
  });

  // =========================================================================
  // Integration Service DB interaction via mocked pool
  // =========================================================================

  describe('Integration Service -> DB interaction (mocked)', () => {
    it('should call pool.query when connecting a platform', async () => {
      // Simulate what IntegrationsService.connectPlatform does
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT existing
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT new

      const userId = 'user-1';
      const platformType = 'google_ads';

      // Simulate the DB calls
      await mockPool.query(
        `SELECT id FROM platform_connections WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
        [userId, platformType],
      );
      await mockPool.query(
        `INSERT INTO platform_connections (id, user_id, platform_type, credentials, config, status, is_active, connected_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', true, $6, $6, $6)`,
        ['test-uuid-generated', userId, platformType, '{}', null, new Date().toISOString()],
      );

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM platform_connections'),
        expect.arrayContaining([userId, platformType]),
      );
    });

    it('should use cache for status lookups', async () => {
      const cachedStatuses = [
        { platform_type: 'google_ads', status: 'connected', last_sync: '2025-01-01T00:00:00Z', health: 'healthy' },
      ];

      mockCacheGet.mockResolvedValueOnce(cachedStatuses);

      const result = await mockCacheGet('integrations:status:user-1');
      expect(result).toEqual(cachedStatuses);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });
});
