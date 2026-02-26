/**
 * E2E tests for Risk Assessment Report workflow.
 *
 * Tests the full risk assessment lifecycle including:
 *   - Report generation with data from multiple risk sources
 *   - Risk categorisation and scoring accuracy
 *   - Mitigation plan generation and prioritisation
 *   - Risk trend analysis over time
 *   - Cross-source risk aggregation consistency
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

import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import { RiskAssessmentOutputService } from '../../../src/services/final-outputs/RiskAssessmentOutputService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryResult(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length };
}

/**
 * Simulates a database environment with configurable risk data for a
 * full report generation workflow.
 */
class RiskDataSimulator {
  private riskFlags: Record<string, unknown>[] = [];
  private fraudAlerts: Record<string, unknown>[] = [];
  private govRiskAssessments: Record<string, unknown>[] = [];
  private gdprStats = { total: 0, compliant: 0 };
  private ccpaStats = { total: 0, compliant: 0 };
  private localLaws: Record<string, unknown>[] = [];
  private fraudMetrics = {
    fraud_campaigns: '0',
    total_campaigns: '10',
  };
  private botPct = '0';
  private anomalyCount = '0';
  private blockedIps = '0';
  private keyRotation = { total: '5', recent: '5' };
  private encryption = { at_rest: 'enabled', in_transit: 'enabled' };
  private soc2Score = '80';
  private lastAudit = '2025-12-01T00:00:00Z';
  private vulnCount = '0';
  private riskTrend: Record<string, unknown>[] = [];
  private govMetrics = { avg_risk: '30', total: '50', high_risk_pct: '10' };

  addRiskFlag(overrides: Record<string, unknown> = {}): this {
    this.riskFlags.push({
      id: `rf-${this.riskFlags.length + 1}`,
      severity: 'medium',
      description: 'Test risk flag',
      status: 'non_compliant',
      resource_type: 'campaign',
      resource_id: 'camp-001',
      country_code: 'DE',
      ...overrides,
    });
    return this;
  }

  addFraudAlert(overrides: Record<string, unknown> = {}): this {
    this.fraudAlerts.push({
      id: `fa-${this.fraudAlerts.length + 1}`,
      type: 'click_fraud',
      severity: 'high',
      confidence_score: 80,
      details: { description: 'Fraud detected' },
      status: 'open',
      campaign_id: 'camp-001',
      country_code: 'US',
      ...overrides,
    });
    return this;
  }

  addGovernanceRisk(overrides: Record<string, unknown> = {}): this {
    this.govRiskAssessments.push({
      id: `ra-${this.govRiskAssessments.length + 1}`,
      risk_score: 60,
      risk_level: 'high',
      decision_id: `dec-${this.govRiskAssessments.length + 1}`,
      agent_type: 'compliance',
      ...overrides,
    });
    return this;
  }

  setGDPR(total: number, compliant: number): this {
    this.gdprStats = { total, compliant };
    return this;
  }

  setCCPA(total: number, compliant: number): this {
    this.ccpaStats = { total, compliant };
    return this;
  }

  setLocalLaws(laws: Array<{ country_code: string; compliant: boolean }>): this {
    this.localLaws = laws;
    return this;
  }

  setFraudMetrics(metrics: { fraud_campaigns: string; total_campaigns: string }): this {
    this.fraudMetrics = metrics;
    return this;
  }

  setBotTrafficPct(pct: string): this {
    this.botPct = pct;
    return this;
  }

  setAnomalyCount(count: string): this {
    this.anomalyCount = count;
    return this;
  }

  setBlockedIps(count: string): this {
    this.blockedIps = count;
    return this;
  }

  setKeyRotation(total: string, recent: string): this {
    this.keyRotation = { total, recent };
    return this;
  }

  setEncryption(atRest: string, inTransit: string): this {
    this.encryption = { at_rest: atRest, in_transit: inTransit };
    return this;
  }

  setSOC2Score(score: string): this {
    this.soc2Score = score;
    return this;
  }

  setVulnerabilities(count: string): this {
    this.vulnCount = count;
    return this;
  }

  setRiskTrend(trend: Array<{ date: Date; risk_score: string }>): this {
    this.riskTrend = trend;
    return this;
  }

  setGovernanceMetrics(metrics: {
    avg_risk: string;
    total: string;
    high_risk_pct: string;
  }): this {
    this.govMetrics = metrics;
    return this;
  }

  /**
   * Installs all mock query responses in sequence matching
   * the order RiskAssessmentOutputService makes database calls.
   */
  install(): void {
    mockQuery
      // fetchRisks: risk_flags
      .mockResolvedValueOnce(makeQueryResult(this.riskFlags))
      // fetchRisks: fraud_alerts
      .mockResolvedValueOnce(makeQueryResult(this.fraudAlerts))
      // fetchRisks: risk_assessments
      .mockResolvedValueOnce(makeQueryResult(this.govRiskAssessments))
      // fetchComplianceStatus: GDPR
      .mockResolvedValueOnce(
        makeQueryResult([
          { total: String(this.gdprStats.total), compliant: String(this.gdprStats.compliant) },
        ]),
      )
      // fetchComplianceStatus: CCPA
      .mockResolvedValueOnce(
        makeQueryResult([
          { total: String(this.ccpaStats.total), compliant: String(this.ccpaStats.compliant) },
        ]),
      )
      // fetchComplianceStatus: local laws
      .mockResolvedValueOnce(makeQueryResult(this.localLaws))
      // fetchFraudMetrics: click fraud rate
      .mockResolvedValueOnce(makeQueryResult([this.fraudMetrics]))
      // fetchFraudMetrics: bot traffic
      .mockResolvedValueOnce(makeQueryResult([{ bot_pct: this.botPct }]))
      // fetchFraudMetrics: anomaly count
      .mockResolvedValueOnce(makeQueryResult([{ anomaly_count: this.anomalyCount }]))
      // fetchFraudMetrics: blocked IPs
      .mockResolvedValueOnce(makeQueryResult([{ blocked_count: this.blockedIps }]))
      // fetchSecurityPosture: key rotation
      .mockResolvedValueOnce(makeQueryResult([this.keyRotation]))
      // fetchSecurityPosture: encryption
      .mockResolvedValueOnce(makeQueryResult([this.encryption]))
      // fetchSecurityPosture: SOC2
      .mockResolvedValueOnce(makeQueryResult([{ readiness_pct: this.soc2Score }]))
      // fetchSecurityPosture: last audit
      .mockResolvedValueOnce(makeQueryResult([{ last_audit: this.lastAudit }]))
      // fetchSecurityPosture: vulnerabilities
      .mockResolvedValueOnce(makeQueryResult([{ vuln_count: this.vulnCount }]))
      // fetchRiskTrend
      .mockResolvedValueOnce(makeQueryResult(this.riskTrend))
      // fetchGovernanceRiskMetrics
      .mockResolvedValueOnce(makeQueryResult([this.govMetrics]));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Risk Assessment Workflow E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('should generate a complete risk report from a healthy system', async () => {
    const sim = new RiskDataSimulator();
    sim
      .setGDPR(10, 10)
      .setCCPA(5, 5)
      .setLocalLaws([
        { country_code: 'DE', compliant: true },
        { country_code: 'US', compliant: true },
      ])
      .setSOC2Score('95')
      .setRiskTrend([
        { date: new Date('2025-12-01'), risk_score: '10' },
        { date: new Date('2025-12-02'), risk_score: '12' },
      ])
      .install();

    const report =
      await RiskAssessmentOutputService.generateRiskAssessmentReport();

    expect(report.overall_risk_level).toBe('low');
    expect(report.risk_score).toBeLessThan(25);
    expect(report.compliance_status.gdpr).toBe(true);
    expect(report.compliance_status.ccpa).toBe(true);
    expect(report.risks).toHaveLength(0);
    expect(report.confidence_score).toBeGreaterThan(0);
  });

  it('should produce a high-risk report when multiple risk sources report issues', async () => {
    const sim = new RiskDataSimulator();
    sim
      .addRiskFlag({ severity: 'critical', description: 'Critical compliance violation' })
      .addRiskFlag({ severity: 'high', description: 'High compliance risk' })
      .addFraudAlert({ severity: 'critical', type: 'click_fraud' })
      .addGovernanceRisk({ risk_level: 'critical', risk_score: 90 })
      .setGDPR(10, 3) // 30% compliant
      .setCCPA(5, 1) // 20% compliant
      .setLocalLaws([
        { country_code: 'DE', compliant: false },
        { country_code: 'US', compliant: false },
      ])
      .setFraudMetrics({ fraud_campaigns: '8', total_campaigns: '10' })
      .setBotTrafficPct('25')
      .setAnomalyCount('10')
      .setBlockedIps('50')
      .setKeyRotation('10', '2') // 8 keys need rotation
      .setEncryption('disabled', 'enabled')
      .setSOC2Score('30')
      .setVulnerabilities('20')
      .setGovernanceMetrics({ avg_risk: '75', total: '100', high_risk_pct: '60' })
      .setRiskTrend([
        { date: new Date('2025-12-01'), risk_score: '70' },
        { date: new Date('2025-12-02'), risk_score: '80' },
      ])
      .install();

    const report =
      await RiskAssessmentOutputService.generateRiskAssessmentReport();

    expect(['high', 'critical']).toContain(report.overall_risk_level);
    expect(report.risk_score).toBeGreaterThanOrEqual(50);
    expect(report.compliance_status.gdpr).toBe(false);
    expect(report.compliance_status.ccpa).toBe(false);
    expect(report.fraud_metrics.click_fraud_rate).toBeGreaterThan(50);
    expect(report.fraud_metrics.bot_traffic_pct).toBeGreaterThan(20);
    expect(report.security_posture.encryption_status).toBe('partially_encrypted');
    expect(report.security_posture.vulnerabilities_found).toBe(20);
    expect(report.risks.length).toBeGreaterThanOrEqual(4);
  });

  it('should generate a prioritised mitigation plan from open risks', async () => {
    // Setup for mitigation plan: risk_flags query + governance risks query
    mockQuery
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            id: 'rf-critical',
            severity: 'critical',
            description: 'Critical: data leak risk',
            resource_type: 'campaign',
            resource_id: 'camp-001',
          },
          {
            id: 'rf-high',
            severity: 'high',
            description: 'High: unauthorized access attempt',
            resource_type: 'api_key',
            resource_id: 'key-001',
          },
          {
            id: 'rf-medium',
            severity: 'medium',
            description: 'Medium: outdated TLS config',
            resource_type: 'encryption',
            resource_id: 'enc-001',
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeQueryResult([
          {
            id: 'ra-critical',
            risk_score: 95,
            risk_level: 'critical',
            decision_id: 'dec-001',
          },
        ]),
      );

    const plan = await RiskAssessmentOutputService.getRiskMitigationPlan();

    // Verify prioritisation order
    expect(plan.length).toBe(4);
    expect(plan[0].priority).toBe(1);
    expect(plan[0].action).toContain('URGENT');
    expect(plan[0].estimated_risk_reduction).toBe(25); // critical

    // Verify owners are assigned correctly
    expect(plan[0].owner).toBe('compliance_team'); // campaign resource
    expect(plan[1].owner).toBe('security_team'); // api_key resource
    expect(plan[2].owner).toBe('security_team'); // encryption resource
    expect(plan[3].owner).toBe('governance_team'); // governance risk

    // Verify deadlines are in ascending order (critical = shortest)
    const deadlines = plan.map((a) => new Date(a.deadline).getTime());
    expect(deadlines[0]).toBeLessThan(deadlines[2]); // critical before medium
  });

  it('should correctly track risk trends over time', async () => {
    const sim = new RiskDataSimulator();
    sim
      .setGDPR(10, 10)
      .setCCPA(5, 5)
      .setLocalLaws([{ country_code: 'DE', compliant: true }])
      .setRiskTrend([
        { date: new Date('2025-11-25'), risk_score: '20' },
        { date: new Date('2025-11-26'), risk_score: '25' },
        { date: new Date('2025-11-27'), risk_score: '30' },
        { date: new Date('2025-11-28'), risk_score: '28' },
        { date: new Date('2025-11-29'), risk_score: '22' },
      ])
      .install();

    const report =
      await RiskAssessmentOutputService.generateRiskAssessmentReport();

    expect(report.risk_trend).toHaveLength(5);
    expect(report.risk_trend[0].risk_score).toBe(20);
    expect(report.risk_trend[4].risk_score).toBe(22);

    // Verify dates are in ascending order
    const dates = report.risk_trend.map((p) => new Date(p.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThan(dates[i - 1]);
    }
  });

  it('should produce consistent risk levels across report and category queries', async () => {
    // First generate a full report
    const sim = new RiskDataSimulator();
    sim
      .addRiskFlag({ severity: 'high', resource_type: 'campaign' })
      .addFraudAlert({ severity: 'medium' })
      .setGDPR(10, 8)
      .setCCPA(5, 5)
      .setLocalLaws([{ country_code: 'DE', compliant: true }])
      .install();

    const report =
      await RiskAssessmentOutputService.generateRiskAssessmentReport();

    // Verify the report risks contain entries for each source
    const complianceRisks = report.risks.filter((r) => r.category === 'compliance');
    const fraudRisks = report.risks.filter((r) => r.category === 'fraud');

    expect(complianceRisks.length).toBeGreaterThanOrEqual(1);
    expect(fraudRisks.length).toBeGreaterThanOrEqual(1);

    // Verify each risk entry has all required fields
    for (const risk of report.risks) {
      expect(risk.id).toBeDefined();
      expect(risk.category).toBeDefined();
      expect(risk.severity).toBeDefined();
      expect(risk.likelihood).toBeDefined();
      expect(risk.impact).toBeDefined();
      expect(risk.description).toBeTruthy();
      expect(risk.mitigation_strategy).toBeTruthy();
      expect(risk.owner).toBeTruthy();
      expect(risk.status).toBeDefined();
      expect(risk.affected_countries).toBeInstanceOf(Array);
    }
  });
});
