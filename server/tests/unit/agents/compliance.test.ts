/**
 * Unit tests for ComplianceAgent (Agent 13).
 *
 * Database, Redis, logger, and helper modules are fully mocked so tests
 * exercise only the agent's compliance evaluation logic, regulation checks,
 * data protection validation, risk flagging, and confidence scoring.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any application imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    LOG_LEVEL: 'error',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('generated-uuid'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { ComplianceAgent } from '../../../src/agents/modules/ComplianceAgent';
import type {
  DataFlowDescription,
} from '../../../src/agents/modules/ComplianceAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAMPAIGN_ROW = {
  id: 'campaign-001',
  name: 'EU Summer Sale',
  country_id: 'country-de',
  country_code: 'DE',
  country_region: 'europe',
  platform: 'meta',
  type: 'conversion',
  status: 'active',
  budget: 10000,
  spent: 2500,
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  targeting: {
    consent_obtained: true,
    supports_erasure: true,
    opt_out_enabled: true,
    privacy_notice_url: 'https://example.com/privacy',
    data_categories: ['email', 'name'],
  },
  created_by: 'user-001',
  created_at: '2025-05-01T00:00:00Z',
  updated_at: '2025-05-01T00:00:00Z',
};

const COMPLIANCE_RULE_GDPR = {
  id: 'rule-gdpr-001',
  name: 'GDPR Consent Rule',
  regulation: 'gdpr',
  country_id: 'country-de',
  rule_definition: {
    required_fields: ['consent_obtained'],
  },
  severity: 'high',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const COMPLIANCE_RULE_TARGETING = {
  id: 'rule-target-001',
  name: 'Restricted Targeting Rule',
  regulation: 'gdpr',
  country_id: 'country-de',
  rule_definition: {
    restricted_targeting: ['health_interests', 'political_affiliation'],
  },
  severity: 'critical',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const COMPLIANCE_RULE_BUDGET = {
  id: 'rule-budget-001',
  name: 'Max Budget Rule',
  regulation: 'gdpr',
  country_id: 'country-de',
  rule_definition: {
    max_budget: 5000,
  },
  severity: 'medium',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceAgent', () => {
  let agent: ComplianceAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new ComplianceAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with correct default config', () => {
      const config = agent.getConfig();
      expect(config.agentType).toBe('compliance');
      expect(config.model).toBe('opus');
      expect(config.confidenceThreshold).toBe(75);
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['localization', 'paid_ads', 'enterprise_security']);
    });

    it('produces a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('GDPR');
      expect(prompt).toContain('CCPA');
    });
  });

  // -----------------------------------------------------------------------
  // evaluateCampaignCompliance
  // -----------------------------------------------------------------------

  describe('evaluateCampaignCompliance', () => {
    it('returns compliant status when no rules are violated', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Compliance rules query (via getComplianceRules)
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_GDPR] });

      const evaluation = await agent.evaluateCampaignCompliance('campaign-001');

      expect(evaluation.campaignId).toBe('campaign-001');
      expect(evaluation.status).toBe('compliant');
      expect(evaluation.violations).toHaveLength(0);
      expect(evaluation.score).toBe(100);
    });

    it('returns non-compliant status when critical/high rule is violated', async () => {
      // Campaign with restricted targeting
      const violatingCampaign = {
        ...CAMPAIGN_ROW,
        targeting: {
          ...CAMPAIGN_ROW.targeting,
          health_interests: true,
        },
      };
      mockQuery.mockResolvedValueOnce({ rows: [violatingCampaign] });
      // Rules: restricted targeting rule
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_TARGETING] });

      const evaluation = await agent.evaluateCampaignCompliance('campaign-001');

      expect(evaluation.status).toBe('non_compliant');
      expect(evaluation.violations.length).toBeGreaterThan(0);
      expect(evaluation.violations[0].severity).toBe('critical');
      expect(evaluation.score).toBeLessThan(100);
    });

    it('returns cached evaluation when available', async () => {
      const cachedEvaluation = {
        campaignId: 'campaign-001',
        status: 'compliant' as const,
        violations: [],
        warnings: [],
        requiredActions: [],
        score: 100,
      };
      mockCacheGet.mockResolvedValueOnce(cachedEvaluation);

      const evaluation = await agent.evaluateCampaignCompliance('campaign-001');

      expect(evaluation).toEqual(cachedEvaluation);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for nonexistent campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.evaluateCampaignCompliance('nonexistent'),
      ).rejects.toThrow('Campaign not found');
    });

    it('marks status as pending_review when only low/medium violations exist', async () => {
      const campaign = { ...CAMPAIGN_ROW, budget: 10000 };
      mockQuery.mockResolvedValueOnce({ rows: [campaign] });
      // Budget cap rule: max_budget = 5000 (medium severity)
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_BUDGET] });

      const evaluation = await agent.evaluateCampaignCompliance('campaign-001');

      expect(evaluation.status).toBe('pending_review');
      expect(evaluation.violations).toHaveLength(1);
      expect(evaluation.violations[0].severity).toBe('medium');
    });
  });

  // -----------------------------------------------------------------------
  // checkRegulation
  // -----------------------------------------------------------------------

  describe('checkRegulation', () => {
    it('identifies prohibited keywords in content', async () => {
      const ruleWithKeywords = {
        ...COMPLIANCE_RULE_GDPR,
        rule_definition: {
          prohibited_keywords: ['miracle', 'guaranteed cure'],
        },
      };
      mockQuery.mockResolvedValueOnce({ rows: [ruleWithKeywords] });

      const result = await agent.checkRegulation(
        'This miracle product offers a guaranteed cure',
        'gdpr',
        'country-de',
      );

      expect(result.compliant).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.requiredChanges.length).toBeGreaterThan(0);
    });

    it('returns compliant when content passes all checks', async () => {
      const ruleWithKeywords = {
        ...COMPLIANCE_RULE_GDPR,
        rule_definition: {
          prohibited_keywords: ['forbidden_term'],
          required_disclosures: ['ad'],
        },
      };
      mockQuery.mockResolvedValueOnce({ rows: [ruleWithKeywords] });

      const result = await agent.checkRegulation(
        'This is a regular ad for our product',
        'gdpr',
        'country-de',
      );

      expect(result.compliant).toBe(true);
      expect(result.requiredChanges).toHaveLength(0);
    });

    it('detects missing required disclosures', async () => {
      const ruleWithDisclosures = {
        ...COMPLIANCE_RULE_GDPR,
        rule_definition: {
          required_disclosures: ['sponsored', 'terms apply'],
        },
      };
      mockQuery.mockResolvedValueOnce({ rows: [ruleWithDisclosures] });

      const result = await agent.checkRegulation(
        'Check out this amazing product',
        'gdpr',
        'country-de',
      );

      expect(result.compliant).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Missing required disclosure'),
        ]),
      );
    });

    it('throws ValidationError for empty content', async () => {
      await expect(
        agent.checkRegulation('', 'gdpr', 'country-de'),
      ).rejects.toThrow('Content must not be empty');
    });

    it('handles no rules found gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.checkRegulation(
        'Some content',
        'lgpd',
        'country-br',
      );

      expect(result.compliant).toBe(true);
      expect(result.findings[0]).toContain('No active rules found');
    });
  });

  // -----------------------------------------------------------------------
  // validateDataProtection
  // -----------------------------------------------------------------------

  describe('validateDataProtection', () => {
    it('identifies sensitive data types requiring explicit consent', async () => {
      const dataFlow: DataFlowDescription = {
        dataTypes: ['health', 'email'],
        source: 'EU',
        destination: 'EU',
        processingPurpose: 'Marketing analytics',
        retentionPeriod: '12 months',
      };

      const result = await agent.validateDataProtection(dataFlow);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Sensitive data type "health"'),
        ]),
      );
      expect(result.requiredConsents.length).toBeGreaterThan(0);
    });

    it('flags cross-border data transfers', async () => {
      const dataFlow: DataFlowDescription = {
        dataTypes: ['email'],
        source: 'EU',
        destination: 'US',
        processingPurpose: 'Ad targeting',
        retentionPeriod: '6 months',
      };

      const result = await agent.validateDataProtection(dataFlow);

      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Cross-border data transfer'),
        ]),
      );
      expect(result.recommendedChanges).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Standard Contractual Clauses'),
        ]),
      );
    });

    it('rejects indefinite retention periods', async () => {
      const dataFlow: DataFlowDescription = {
        dataTypes: ['cookie'],
        source: 'EU',
        destination: 'EU',
        processingPurpose: 'Analytics',
        retentionPeriod: 'indefinite',
      };

      const result = await agent.validateDataProtection(dataFlow);

      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Indefinite data retention'),
        ]),
      );
    });

    it('returns valid for non-sensitive same-region flows with complete info', async () => {
      const dataFlow: DataFlowDescription = {
        dataTypes: ['page_views', 'click_counts'],
        source: 'US',
        destination: 'US',
        processingPurpose: 'Aggregate analytics',
        retentionPeriod: '30 days',
      };

      const result = await agent.validateDataProtection(dataFlow);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('flags missing processing purpose', async () => {
      const dataFlow: DataFlowDescription = {
        dataTypes: ['email'],
        source: 'EU',
        destination: 'EU',
        processingPurpose: '',
        retentionPeriod: '12 months',
      };

      const result = await agent.validateDataProtection(dataFlow);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Processing purpose is not defined'),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // flagHighRiskCampaign
  // -----------------------------------------------------------------------

  describe('flagHighRiskCampaign', () => {
    it('returns risk flags for a non-compliant campaign', async () => {
      const violatingCampaign = {
        ...CAMPAIGN_ROW,
        budget: 60000,
        targeting: {
          ...CAMPAIGN_ROW.targeting,
          health_interests: true,
        },
      };

      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [violatingCampaign] });
      // Existing risk flags query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Compliance rules via getComplianceRules
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_TARGETING] });
      // INSERT risk flag
      mockQuery.mockResolvedValue({ rows: [] });

      const flags = await agent.flagHighRiskCampaign('campaign-001');

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].resource_type).toBe('campaign');
      expect(flags[0].resource_id).toBe('campaign-001');
    });

    it('throws NotFoundError for nonexistent campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.flagHighRiskCampaign('nonexistent'),
      ).rejects.toThrow('Campaign not found');
    });
  });

  // -----------------------------------------------------------------------
  // checkGDPRCompliance
  // -----------------------------------------------------------------------

  describe('checkGDPRCompliance', () => {
    it('returns compliant for a properly configured campaign', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // GDPR rules query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.checkGDPRCompliance('campaign-001');

      expect(result.compliant).toBe(true);
      expect(result.consentObtained).toBe(true);
      expect(result.dataMinimization).toBe(true);
      expect(result.rightToErasure).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('identifies GDPR issues for unconfigured campaigns', async () => {
      const noncompliantCampaign = {
        ...CAMPAIGN_ROW,
        targeting: {},
      };
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [noncompliantCampaign] });
      // GDPR rules query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.checkGDPRCompliance('campaign-001');

      expect(result.compliant).toBe(false);
      expect(result.consentObtained).toBe(false);
      expect(result.rightToErasure).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkCCPACompliance
  // -----------------------------------------------------------------------

  describe('checkCCPACompliance', () => {
    it('returns compliant for a properly configured campaign', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // CCPA rules query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.checkCCPACompliance('campaign-001');

      expect(result.compliant).toBe(true);
      expect(result.optOutProvided).toBe(true);
      expect(result.privacyNotice).toBe(true);
      expect(result.dataInventory).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('identifies CCPA issues for unconfigured campaigns', async () => {
      const noncompliantCampaign = {
        ...CAMPAIGN_ROW,
        targeting: {},
      };
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [noncompliantCampaign] });
      // CCPA rules query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.checkCCPACompliance('campaign-001');

      expect(result.compliant).toBe(false);
      expect(result.optOutProvided).toBe(false);
      expect(result.privacyNotice).toBe(false);
      expect(result.dataInventory).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('opt-out'),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // assessConsentRequirements
  // -----------------------------------------------------------------------

  describe('assessConsentRequirements', () => {
    it('identifies explicit consent requirements for sensitive data', async () => {
      // getComplianceRules -> rules with gdpr regulation
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_GDPR] });

      const requirements = await agent.assessConsentRequirements(
        'country-de',
        ['health', 'email'],
      );

      const healthReq = requirements.find((r) => r.dataType === 'health');
      expect(healthReq).toBeDefined();
      expect(healthReq!.required).toBe(true);
      expect(healthReq!.basis).toBe('explicit_consent');

      const emailReq = requirements.find((r) => r.dataType === 'email');
      expect(emailReq).toBeDefined();
      expect(emailReq!.required).toBe(true);
    });

    it('throws ValidationError for empty data types array', async () => {
      await expect(
        agent.assessConsentRequirements('country-de', []),
      ).rejects.toThrow('At least one data type must be provided');
    });
  });

  // -----------------------------------------------------------------------
  // getComplianceRules
  // -----------------------------------------------------------------------

  describe('getComplianceRules', () => {
    it('fetches rules from database and caches them', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_GDPR, COMPLIANCE_RULE_TARGETING] });

      const rules = await agent.getComplianceRules('country-de');

      expect(rules).toHaveLength(2);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'compliance:rules:country-de',
        expect.any(Array),
        300,
      );
    });

    it('returns cached rules when available', async () => {
      const cachedRules = [COMPLIANCE_RULE_GDPR];
      mockCacheGet.mockResolvedValueOnce(cachedRules);

      const rules = await agent.getComplianceRules('country-de');

      expect(rules).toEqual(cachedRules);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // process (main entry point)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('evaluates a campaign when action is "evaluate"', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Compliance rules
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process({
        context: {},
        parameters: { action: 'evaluate', campaignId: 'campaign-001' },
        requestId: 'req-001',
      });

      expect(output.agentType).toBe('compliance');
      expect(output.decision).toBe('campaign_compliant');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.timestamp).toBeDefined();
    });

    it('flags uncertainty when action/parameters are incomplete', async () => {
      // logDecision INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process({
        context: {},
        parameters: { action: 'unknown_action' },
        requestId: 'req-002',
      });

      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.confidence.level).toBe('low');
    });

    it('includes confidence score with factors in output', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Compliance rules
      mockQuery.mockResolvedValueOnce({ rows: [COMPLIANCE_RULE_GDPR] });
      // logDecision INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process({
        context: {},
        parameters: { action: 'evaluate', campaignId: 'campaign-001' },
        requestId: 'req-003',
      });

      expect(output.confidence).toHaveProperty('score');
      expect(output.confidence).toHaveProperty('level');
      expect(output.confidence).toHaveProperty('factors');
      expect(output.confidence.factors).toHaveProperty('rule_coverage');
      expect(output.confidence.factors).toHaveProperty('data_completeness');
      expect(output.confidence.factors).toHaveProperty('regulation_currency');
      expect(output.confidence.factors).toHaveProperty('analysis_depth');
    });
  });

  // -----------------------------------------------------------------------
  // generateComplianceReport
  // -----------------------------------------------------------------------

  describe('generateComplianceReport', () => {
    it('generates a report across all non-archived campaigns', async () => {
      // Campaigns query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'campaign-001' }, { id: 'campaign-002' }],
      });
      // evaluateCampaignCompliance for campaign-001
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // rules
      // evaluateCampaignCompliance for campaign-002
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, id: 'campaign-002' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // rules

      const report = await agent.generateComplianceReport();

      expect(report.totalCampaigns).toBe(2);
      expect(report.compliant).toBe(2);
      expect(report.nonCompliant).toBe(0);
      expect(report.period).toBe('all time');
      expect(report.riskScore).toBe(0);
    });

    it('filters campaigns by date range when provided', async () => {
      // Campaigns query with date filter
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'campaign-001' }] });
      // evaluateCampaignCompliance
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // rules

      const report = await agent.generateComplianceReport({
        startDate: '2025-06-01',
        endDate: '2025-08-31',
      });

      expect(report.period).toBe('2025-06-01 to 2025-08-31');
      expect(report.totalCampaigns).toBe(1);

      // Verify date params were passed to the query
      const firstCallParams = mockQuery.mock.calls[0][1];
      expect(firstCallParams).toContain('2025-06-01');
      expect(firstCallParams).toContain('2025-08-31');
    });
  });

  // -----------------------------------------------------------------------
  // enforceAdRestrictions
  // -----------------------------------------------------------------------

  describe('enforceAdRestrictions', () => {
    it('blocks creatives containing prohibited keywords', async () => {
      // Campaign query
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // Ad restriction rules
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...COMPLIANCE_RULE_GDPR,
          rule_definition: {
            type: 'ad_restriction',
            prohibited_keywords: ['miracle'],
          },
        }],
      });
      // Creatives query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'creative-001', content: 'This miracle product is amazing', type: 'ad_copy' },
          { id: 'creative-002', content: 'A regular advertisement', type: 'ad_copy' },
        ],
      });

      const result = await agent.enforceAdRestrictions('campaign-001', 'country-de');

      expect(result.campaignId).toBe('campaign-001');
      expect(result.blockedContent.length).toBeGreaterThan(0);
      expect(result.blockedContent[0]).toContain('creative-001');
      expect(result.allowedContent.length).toBeGreaterThan(0);
      expect(result.allowedContent[0]).toContain('creative-002');
    });

    it('throws NotFoundError when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        agent.enforceAdRestrictions('nonexistent', 'country-de'),
      ).rejects.toThrow('Campaign not found');
    });
  });
});
