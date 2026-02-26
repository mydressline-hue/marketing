/**
 * Unit tests for RiskAssessmentOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (risk aggregation, scoring, classification, mitigation).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { RiskAssessmentOutputService } from '../../../../src/services/final-outputs/RiskAssessmentOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRiskFlagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rf-001',
    severity: 'high',
    description: 'Non-compliant campaign targeting',
    status: 'non_compliant',
    resource_type: 'campaign',
    resource_id: 'camp-001',
    country_code: 'DE',
    ...overrides,
  };
}

function makeFraudAlertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fa-001',
    type: 'click_fraud',
    severity: 'high',
    confidence_score: 85,
    details: { description: 'Suspicious click pattern detected' },
    status: 'open',
    campaign_id: 'camp-001',
    country_code: 'US',
    ...overrides,
  };
}

function makeRiskAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ra-001',
    risk_score: 65,
    risk_level: 'high',
    decision_id: 'dec-001',
    agent_type: 'compliance',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Query result helper
// ---------------------------------------------------------------------------

function makeQueryResult(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RiskAssessmentOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // generateRiskAssessmentReport
  // -----------------------------------------------------------------------

  describe('generateRiskAssessmentReport', () => {
    function setupDefaultQueryMocks() {
      // Query call order follows Promise.all concurrency:
      // 1-3: fetchRisks (inner Promise.all: risk_flags, fraud_alerts, risk_assessments)
      // 4:   fetchComplianceStatus (sequential, first: gdpr)
      // 5-8: fetchFraudMetrics (inner Promise.all: fraud_rate, bot, anomaly, blocked)
      // 9-13: fetchSecurityPosture (inner Promise.all: key_rotation, encryption, soc2, audit, vulns)
      // 14:  fetchRiskTrend
      // 15:  fetchGovernanceRiskMetrics
      // 16:  fetchComplianceStatus (sequential, second: ccpa) -- after gdpr resolves
      // 17:  fetchComplianceStatus (sequential, third: local_laws) -- after ccpa resolves
      mockQuery
        // 1. risk_flags
        .mockResolvedValueOnce(
          makeQueryResult([makeRiskFlagRow()]),
        )
        // 2. fraud_alerts
        .mockResolvedValueOnce(
          makeQueryResult([makeFraudAlertRow()]),
        )
        // 3. risk_assessments (governance)
        .mockResolvedValueOnce(
          makeQueryResult([makeRiskAssessmentRow()]),
        )
        // 4. fetchComplianceStatus: gdpr
        .mockResolvedValueOnce(
          makeQueryResult([{ total: '10', compliant: '8' }]),
        )
        // 5. fetchFraudMetrics: click fraud rate
        .mockResolvedValueOnce(
          makeQueryResult([{ fraud_campaigns: '2', total_campaigns: '20' }]),
        )
        // 6. fetchFraudMetrics: bot traffic
        .mockResolvedValueOnce(
          makeQueryResult([{ bot_pct: '5.5' }]),
        )
        // 7. fetchFraudMetrics: anomaly count
        .mockResolvedValueOnce(
          makeQueryResult([{ anomaly_count: '3' }]),
        )
        // 8. fetchFraudMetrics: blocked IPs
        .mockResolvedValueOnce(
          makeQueryResult([{ blocked_count: '15' }]),
        )
        // 9. fetchSecurityPosture: API key rotation
        .mockResolvedValueOnce(
          makeQueryResult([{ total: '5', recent: '5' }]),
        )
        // 10. fetchSecurityPosture: encryption
        .mockResolvedValueOnce(
          makeQueryResult([{ at_rest: 'enabled', in_transit: 'enabled' }]),
        )
        // 11. fetchSecurityPosture: SOC2
        .mockResolvedValueOnce(
          makeQueryResult([{ readiness_pct: '85' }]),
        )
        // 12. fetchSecurityPosture: last audit
        .mockResolvedValueOnce(
          makeQueryResult([{ last_audit: '2025-12-01T00:00:00Z' }]),
        )
        // 13. fetchSecurityPosture: vulnerabilities
        .mockResolvedValueOnce(
          makeQueryResult([{ vuln_count: '2' }]),
        )
        // 14. fetchRiskTrend
        .mockResolvedValueOnce(
          makeQueryResult([
            { date: new Date('2025-12-01'), risk_score: '40' },
            { date: new Date('2025-12-02'), risk_score: '45' },
          ]),
        )
        // 15. fetchGovernanceRiskMetrics
        .mockResolvedValueOnce(
          makeQueryResult([{ avg_risk: '35', total: '50', high_risk_pct: '20' }]),
        )
        // 16. fetchComplianceStatus: ccpa (after gdpr resolves)
        .mockResolvedValueOnce(
          makeQueryResult([{ total: '5', compliant: '5' }]),
        )
        // 17. fetchComplianceStatus: local ad laws (after ccpa resolves)
        .mockResolvedValueOnce(
          makeQueryResult([
            { country_code: 'DE', compliant: true },
            { country_code: 'US', compliant: true },
          ]),
        );
    }

    it('should return a complete risk assessment report', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      expect(report).toBeDefined();
      expect(report.overall_risk_level).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(
        report.overall_risk_level,
      );
      expect(report.risk_score).toBeGreaterThanOrEqual(0);
      expect(report.risk_score).toBeLessThanOrEqual(100);
      expect(report.risks).toBeInstanceOf(Array);
      expect(report.risks.length).toBeGreaterThan(0);
      expect(report.compliance_status).toBeDefined();
      expect(report.fraud_metrics).toBeDefined();
      expect(report.security_posture).toBeDefined();
      expect(report.risk_trend).toBeInstanceOf(Array);
      expect(report.generated_at).toBeDefined();
      expect(report.confidence_score).toBeGreaterThanOrEqual(0);
      expect(report.confidence_score).toBeLessThanOrEqual(100);
    });

    it('should return cached data when available', async () => {
      const cachedReport = {
        overall_risk_level: 'medium' as const,
        risk_score: 42,
        risks: [],
        compliance_status: { gdpr: true, ccpa: true, local_ad_laws: {} },
        fraud_metrics: {
          click_fraud_rate: 0,
          bot_traffic_pct: 0,
          anomaly_count: 0,
          blocked_ips_count: 0,
        },
        security_posture: {
          api_key_rotation_status: 'current',
          encryption_status: 'fully_encrypted',
          soc2_readiness_pct: 90,
          last_audit_date: '2025-12-01T00:00:00Z',
          vulnerabilities_found: 0,
        },
        risk_trend: [],
        generated_at: '2025-12-01T00:00:00Z',
        confidence_score: 80,
      };

      mockCacheGet.mockResolvedValueOnce(cachedReport);

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      expect(report).toEqual(cachedReport);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should classify GDPR as non-compliant when not all checks pass', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      // GDPR: 8/10 compliant = non-compliant
      expect(report.compliance_status.gdpr).toBe(false);
    });

    it('should classify CCPA as compliant when all checks pass', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      // CCPA: 5/5 compliant
      expect(report.compliance_status.ccpa).toBe(true);
    });

    it('should correctly aggregate fraud metrics from database', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      expect(report.fraud_metrics.click_fraud_rate).toBe(10); // 2/20 = 10%
      expect(report.fraud_metrics.bot_traffic_pct).toBe(6); // rounded from 5.5
      expect(report.fraud_metrics.anomaly_count).toBe(3);
      expect(report.fraud_metrics.blocked_ips_count).toBe(15);
    });

    it('should correctly determine security posture', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      expect(report.security_posture.api_key_rotation_status).toBe('current');
      expect(report.security_posture.encryption_status).toBe('fully_encrypted');
      expect(report.security_posture.soc2_readiness_pct).toBe(85);
      expect(report.security_posture.vulnerabilities_found).toBe(2);
    });

    it('should include risk entries from all three data sources', async () => {
      setupDefaultQueryMocks();

      const report =
        await RiskAssessmentOutputService.generateRiskAssessmentReport();

      // Should have: 1 risk flag + 1 fraud alert + 1 governance risk
      expect(report.risks.length).toBe(3);

      const categories = report.risks.map((r) => r.category);
      expect(categories).toContain('compliance');
      expect(categories).toContain('fraud');
    });

    it('should cache the report after generation', async () => {
      setupDefaultQueryMocks();

      await RiskAssessmentOutputService.generateRiskAssessmentReport();

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('risk_assessment'),
        expect.objectContaining({
          overall_risk_level: expect.any(String),
          risk_score: expect.any(Number),
        }),
        expect.any(Number),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getRisksByCategory
  // -----------------------------------------------------------------------

  describe('getRisksByCategory', () => {
    it('should return risks filtered by compliance category', async () => {
      mockQuery.mockResolvedValueOnce(
        makeQueryResult([
          makeRiskFlagRow({ resource_type: 'campaign' }),
          makeRiskFlagRow({
            id: 'rf-002',
            resource_type: 'api_key',
            country_code: null,
          }),
        ]),
      );

      const risks =
        await RiskAssessmentOutputService.getRisksByCategory('compliance');

      // Only campaign resource_type should be categorized as compliance
      expect(risks.length).toBe(1);
      expect(risks[0].category).toBe('compliance');
    });

    it('should return cached category results when available', async () => {
      const cachedRisks = [
        {
          id: 'rf-001',
          category: 'fraud' as const,
          severity: 'high' as const,
          likelihood: 'high' as const,
          impact: 'high' as const,
          description: 'Fraud risk',
          affected_countries: ['US'],
          mitigation_strategy: 'Block IPs',
          owner: 'fraud_detection_team',
          status: 'open' as const,
        },
      ];

      mockCacheGet.mockResolvedValueOnce(cachedRisks);

      const risks =
        await RiskAssessmentOutputService.getRisksByCategory('fraud');

      expect(risks).toEqual(cachedRisks);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty array when no risks match category', async () => {
      mockQuery.mockResolvedValueOnce(
        makeQueryResult([
          makeRiskFlagRow({ resource_type: 'campaign' }),
        ]),
      );

      const risks =
        await RiskAssessmentOutputService.getRisksByCategory('financial');

      expect(risks).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getRiskMitigationPlan
  // -----------------------------------------------------------------------

  describe('getRiskMitigationPlan', () => {
    it('should return prioritised mitigation actions', async () => {
      mockQuery
        // risk_flags
        .mockResolvedValueOnce(
          makeQueryResult([
            makeRiskFlagRow({ severity: 'critical' }),
            makeRiskFlagRow({ id: 'rf-002', severity: 'high' }),
          ]),
        )
        // governance risk_assessments
        .mockResolvedValueOnce(
          makeQueryResult([
            makeRiskAssessmentRow({ risk_level: 'critical' }),
          ]),
        );

      const plan =
        await RiskAssessmentOutputService.getRiskMitigationPlan();

      expect(plan.length).toBe(3); // 2 risk flags + 1 governance risk
      expect(plan[0].priority).toBe(1);
      expect(plan[1].priority).toBe(2);
      expect(plan[2].priority).toBe(3);
    });

    it('should assign higher estimated risk reduction to critical items', async () => {
      mockQuery
        .mockResolvedValueOnce(
          makeQueryResult([
            makeRiskFlagRow({ severity: 'critical' }),
            makeRiskFlagRow({ id: 'rf-002', severity: 'medium' }),
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([]));

      const plan =
        await RiskAssessmentOutputService.getRiskMitigationPlan();

      expect(plan[0].estimated_risk_reduction).toBe(25); // critical
      expect(plan[1].estimated_risk_reduction).toBe(10); // medium
    });

    it('should return cached mitigation plan when available', async () => {
      const cachedPlan = [
        {
          id: 'mitigation-rf-001',
          risk_id: 'rf-001',
          priority: 1,
          action: 'Fix critical risk',
          owner: 'compliance_team',
          deadline: '2025-12-02T00:00:00Z',
          status: 'pending' as const,
          estimated_risk_reduction: 25,
        },
      ];

      mockCacheGet.mockResolvedValueOnce(cachedPlan);

      const plan =
        await RiskAssessmentOutputService.getRiskMitigationPlan();

      expect(plan).toEqual(cachedPlan);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return empty array when no open risks exist', async () => {
      mockQuery
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]));

      const plan =
        await RiskAssessmentOutputService.getRiskMitigationPlan();

      expect(plan).toEqual([]);
    });

    it('should assign correct owners based on resource type', async () => {
      mockQuery
        .mockResolvedValueOnce(
          makeQueryResult([
            makeRiskFlagRow({ resource_type: 'campaign' }),
            makeRiskFlagRow({
              id: 'rf-002',
              resource_type: 'api_key',
            }),
          ]),
        )
        .mockResolvedValueOnce(makeQueryResult([]));

      const plan =
        await RiskAssessmentOutputService.getRiskMitigationPlan();

      expect(plan[0].owner).toBe('compliance_team');
      expect(plan[1].owner).toBe('security_team');
    });
  });
});
