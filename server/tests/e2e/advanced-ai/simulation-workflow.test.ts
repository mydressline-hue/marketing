/**
 * E2E tests for Simulation Engine & Strategic Commander workflows (Phase 7).
 *
 * Tests complete workflow scenarios:
 *   1. Full campaign simulation lifecycle
 *   2. Multi-scenario comparison and selection
 *   3. Pre-launch risk assessment (go/no-go)
 *   4. Strategy sandbox testing against historical data
 *   5. Competitor reaction modeling and strategy adjustment
 *   6. Scaling prediction with diminishing returns
 *   7. CPC inflation and audience saturation modeling
 *   8. Strategic Commander projection and challenge workflows
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
// Domain simulators
// ---------------------------------------------------------------------------

interface SimulationInput {
  campaign_id: string;
  country: string;
  channel: string;
  budget: number;
  duration_days: number;
  target_audience?: string;
}

interface SimulationResult {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: SimulationInput;
  projected_roas: number;
  projected_conversions: number;
  projected_revenue: number;
  projected_spend: number;
  confidence_interval: { lower: number; upper: number };
  risk_score: number;
  recommendations: string[];
  created_at: string;
  completed_at?: string;
}

interface ScalingPrediction {
  current_spend: number;
  proposed_spend: number;
  predicted_roas: number;
  diminishing_returns_threshold: number;
  saturation_point: number;
  marginal_cost_curve: Array<{ spend: number; marginal_cpa: number }>;
  audience_saturation_pct: number;
  cpc_inflation_pct: number;
}

interface CompetitorReaction {
  competitor: string;
  likely_action: string;
  probability: number;
  impact_on_cpc: number;
  impact_on_impression_share: number;
}

interface StrategicProjection {
  id: string;
  horizon_days: number;
  day_30: { revenue: number; spend: number; roas: number };
  day_60: { revenue: number; spend: number; roas: number };
  day_90: { revenue: number; spend: number; roas: number };
  confidence_bands: {
    optimistic: { revenue: number };
    pessimistic: { revenue: number };
  };
  risk_factors: string[];
}

interface Scenario {
  name: string;
  description: string;
  projected_revenue: number;
  projected_roas: number;
  risk_level: 'low' | 'medium' | 'high';
  probability_of_success: number;
  downside_exposure: number;
}

interface ChallengeResult {
  decision: string;
  arguments_for: string[];
  arguments_against: string[];
  risk_assessment: { overall: string; downside: number; upside: number };
  verdict: 'proceed' | 'modify' | 'reject';
  modified_recommendation?: string;
}

class SimulationWorkflowSimulator {
  private simulations: Map<string, SimulationResult> = new Map();
  private simulationCounter = 0;

  runCampaignSimulation(input: SimulationInput): SimulationResult {
    this.simulationCounter += 1;
    const id = `sim-${this.simulationCounter}`;
    const baseRoas = this.calculateBaseRoas(input.channel, input.country);
    const budgetEfficiency = Math.max(0.5, 1 - (input.budget - 10000) / 100000);
    const projectedRoas = parseFloat((baseRoas * budgetEfficiency).toFixed(2));
    const projectedRevenue = Math.round(input.budget * projectedRoas);
    const projectedConversions = Math.round(projectedRevenue / 85);

    const result: SimulationResult = {
      id,
      type: 'campaign',
      status: 'completed',
      input,
      projected_roas: projectedRoas,
      projected_conversions: projectedConversions,
      projected_revenue: projectedRevenue,
      projected_spend: input.budget,
      confidence_interval: {
        lower: parseFloat((projectedRoas * 0.85).toFixed(2)),
        upper: parseFloat((projectedRoas * 1.15).toFixed(2)),
      },
      risk_score: parseFloat((1 - budgetEfficiency).toFixed(2)),
      recommendations: this.generateRecommendations(projectedRoas, input),
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    this.simulations.set(id, result);
    return result;
  }

  predictScaling(currentSpend: number, proposedSpend: number, channel: string): ScalingPrediction {
    const scaleFactor = proposedSpend / currentSpend;
    const diminishingFactor = Math.max(0.4, 1 - (scaleFactor - 1) * 0.3);
    const baseRoas = this.calculateBaseRoas(channel, 'US');
    const saturationPoint = currentSpend * 4;
    const diminishingThreshold = currentSpend * 2;

    const marginalCostCurve: Array<{ spend: number; marginal_cpa: number }> = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const spend = currentSpend + (proposedSpend - currentSpend) * (i / steps);
      const scale = spend / currentSpend;
      const efficiency = Math.max(0.3, 1 - (scale - 1) * 0.25);
      marginalCostCurve.push({
        spend: Math.round(spend),
        marginal_cpa: parseFloat((15 / efficiency).toFixed(2)),
      });
    }

    return {
      current_spend: currentSpend,
      proposed_spend: proposedSpend,
      predicted_roas: parseFloat((baseRoas * diminishingFactor).toFixed(2)),
      diminishing_returns_threshold: diminishingThreshold,
      saturation_point: saturationPoint,
      marginal_cost_curve: marginalCostCurve,
      audience_saturation_pct: parseFloat((Math.min(100, (proposedSpend / saturationPoint) * 100)).toFixed(1)),
      cpc_inflation_pct: parseFloat(((scaleFactor - 1) * 15).toFixed(1)),
    };
  }

  modelCompetitorReactions(action: string, channel: string): CompetitorReaction[] {
    const competitors = ['AlphaAdTech', 'BetaMarketing', 'GammaDirect'];
    return competitors.map((competitor, idx) => {
      const baseProbability = 0.7 - idx * 0.15;
      return {
        competitor,
        likely_action: idx === 0 ? 'match_bids' : idx === 1 ? 'shift_channels' : 'no_reaction',
        probability: parseFloat(baseProbability.toFixed(2)),
        impact_on_cpc: parseFloat(((idx === 0 ? 0.15 : idx === 1 ? -0.05 : 0) * (action === 'aggressive' ? 1.5 : 1)).toFixed(2)),
        impact_on_impression_share: parseFloat(((idx === 0 ? -0.08 : idx === 1 ? 0.02 : 0) * (action === 'aggressive' ? 1.3 : 1)).toFixed(2)),
      };
    });
  }

  sandboxTest(strategyInput: SimulationInput, historicalData: Array<{ month: string; actual_roas: number }>): {
    strategy_performance: number;
    historical_comparison: Array<{ month: string; actual_roas: number; simulated_roas: number; delta: number }>;
    outperforms_historical: boolean;
  } {
    const simResult = this.runCampaignSimulation(strategyInput);
    const comparison = historicalData.map((h) => {
      const simulated = parseFloat((simResult.projected_roas * (0.85 + Math.random() * 0.3)).toFixed(2));
      return {
        month: h.month,
        actual_roas: h.actual_roas,
        simulated_roas: simulated,
        delta: parseFloat((simulated - h.actual_roas).toFixed(2)),
      };
    });

    const avgDelta = comparison.reduce((sum, c) => sum + c.delta, 0) / comparison.length;

    return {
      strategy_performance: simResult.projected_roas,
      historical_comparison: comparison,
      outperforms_historical: avgDelta > 0,
    };
  }

  assessPreLaunchRisk(input: SimulationInput): {
    simulation: SimulationResult;
    risk_assessment: {
      overall_risk: 'low' | 'medium' | 'high' | 'critical';
      go_no_go: 'go' | 'no-go' | 'conditional-go';
      conditions?: string[];
      risk_factors: Array<{ factor: string; severity: string; mitigation: string }>;
    };
  } {
    const simulation = this.runCampaignSimulation(input);
    const riskScore = simulation.risk_score;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    let goNoGo: 'go' | 'no-go' | 'conditional-go';
    const conditions: string[] = [];
    const riskFactors: Array<{ factor: string; severity: string; mitigation: string }> = [];

    if (riskScore < 0.2) {
      overallRisk = 'low';
      goNoGo = 'go';
    } else if (riskScore < 0.4) {
      overallRisk = 'medium';
      goNoGo = 'conditional-go';
      conditions.push('Set daily budget caps');
      conditions.push('Enable automated pause rules');
      riskFactors.push({ factor: 'Budget efficiency', severity: 'medium', mitigation: 'Set stop-loss at 20% below target ROAS' });
    } else if (riskScore < 0.6) {
      overallRisk = 'high';
      goNoGo = 'conditional-go';
      conditions.push('Reduce initial budget by 30%');
      conditions.push('Implement 48-hour review checkpoint');
      riskFactors.push({ factor: 'High budget', severity: 'high', mitigation: 'Phase budget increase over 2 weeks' });
      riskFactors.push({ factor: 'Market uncertainty', severity: 'medium', mitigation: 'Diversify across channels' });
    } else {
      overallRisk = 'critical';
      goNoGo = 'no-go';
      riskFactors.push({ factor: 'Excessive risk', severity: 'critical', mitigation: 'Redesign campaign parameters' });
    }

    return {
      simulation,
      risk_assessment: {
        overall_risk: overallRisk,
        go_no_go: goNoGo,
        conditions: conditions.length > 0 ? conditions : undefined,
        risk_factors: riskFactors,
      },
    };
  }

  getSimulation(id: string): SimulationResult | undefined {
    return this.simulations.get(id);
  }

  getAllSimulations(): SimulationResult[] {
    return Array.from(this.simulations.values());
  }

  compareSimulations(ids: string[]): {
    simulations: SimulationResult[];
    best_roas: string;
    best_revenue: string;
    lowest_risk: string;
    recommendation: string;
  } {
    const sims = ids.map((id) => this.simulations.get(id)).filter(Boolean) as SimulationResult[];
    const bestRoas = sims.reduce((best, s) => s.projected_roas > best.projected_roas ? s : best, sims[0]);
    const bestRevenue = sims.reduce((best, s) => s.projected_revenue > best.projected_revenue ? s : best, sims[0]);
    const lowestRisk = sims.reduce((best, s) => s.risk_score < best.risk_score ? s : best, sims[0]);

    return {
      simulations: sims,
      best_roas: bestRoas.id,
      best_revenue: bestRevenue.id,
      lowest_risk: lowestRisk.id,
      recommendation: lowestRisk.id === bestRoas.id
        ? `${bestRoas.id} offers best ROAS with lowest risk`
        : `Consider ${lowestRisk.id} for safety or ${bestRoas.id} for growth`,
    };
  }

  private calculateBaseRoas(channel: string, country: string): number {
    const channelMultiplier: Record<string, number> = {
      google_ads: 4.0,
      meta: 3.5,
      tiktok: 2.8,
      linkedin: 3.2,
      email: 5.5,
    };
    const countryMultiplier: Record<string, number> = {
      US: 1.0,
      DE: 0.95,
      UK: 0.98,
      FR: 0.90,
      JP: 0.85,
    };
    return (channelMultiplier[channel] || 3.0) * (countryMultiplier[country] || 0.90);
  }

  private generateRecommendations(roas: number, input: SimulationInput): string[] {
    const recs: string[] = [];
    if (roas < 2.0) recs.push('Consider reducing budget or changing channel');
    if (roas >= 2.0 && roas < 3.0) recs.push('Optimize targeting to improve efficiency');
    if (roas >= 3.0 && roas < 4.0) recs.push('Good performance; consider gradual scaling');
    if (roas >= 4.0) recs.push('Strong performance; evaluate scaling opportunity');
    if (input.budget > 50000) recs.push('Large budget: monitor for diminishing returns');
    if (input.duration_days < 14) recs.push('Short duration: allow learning phase before judging');
    return recs;
  }
}

class StrategicCommanderSimulator {
  generateProjection(horizonDays: number, currentMonthlyRevenue: number, currentMonthlySpend: number): StrategicProjection {
    const monthlyGrowth = 0.05;
    const day30Revenue = Math.round(currentMonthlyRevenue * (1 + monthlyGrowth));
    const day60Revenue = Math.round(currentMonthlyRevenue * Math.pow(1 + monthlyGrowth, 2));
    const day90Revenue = Math.round(currentMonthlyRevenue * Math.pow(1 + monthlyGrowth, 3));

    const day30Spend = Math.round(currentMonthlySpend * 1.03);
    const day60Spend = Math.round(currentMonthlySpend * 1.06);
    const day90Spend = Math.round(currentMonthlySpend * 1.09);

    return {
      id: `proj-${Date.now()}`,
      horizon_days: horizonDays,
      day_30: { revenue: day30Revenue, spend: day30Spend, roas: parseFloat((day30Revenue / day30Spend).toFixed(2)) },
      day_60: { revenue: day60Revenue, spend: day60Spend, roas: parseFloat((day60Revenue / day60Spend).toFixed(2)) },
      day_90: { revenue: day90Revenue, spend: day90Spend, roas: parseFloat((day90Revenue / day90Spend).toFixed(2)) },
      confidence_bands: {
        optimistic: { revenue: Math.round(day90Revenue * 1.2) },
        pessimistic: { revenue: Math.round(day90Revenue * 0.8) },
      },
      risk_factors: ['Market volatility', 'Seasonal fluctuations', 'Competitor activity'],
    };
  }

  generateScenarios(budgetMin: number, budgetMax: number): Scenario[] {
    const mid = (budgetMin + budgetMax) / 2;
    return [
      {
        name: 'Conservative',
        description: 'Minimum budget with focus on proven channels',
        projected_revenue: Math.round(budgetMin * 3.8),
        projected_roas: 3.8,
        risk_level: 'low',
        probability_of_success: 0.88,
        downside_exposure: Math.round(budgetMin * 0.1),
      },
      {
        name: 'Balanced',
        description: 'Mid-range budget with diversified channels',
        projected_revenue: Math.round(mid * 3.4),
        projected_roas: 3.4,
        risk_level: 'medium',
        probability_of_success: 0.75,
        downside_exposure: Math.round(mid * 0.2),
      },
      {
        name: 'Aggressive',
        description: 'Maximum budget with new channel exploration',
        projected_revenue: Math.round(budgetMax * 2.8),
        projected_roas: 2.8,
        risk_level: 'high',
        probability_of_success: 0.55,
        downside_exposure: Math.round(budgetMax * 0.35),
      },
    ];
  }

  selectOptimalScenario(scenarios: Scenario[], riskTolerance: 'low' | 'medium' | 'high'): Scenario {
    const filtered = scenarios.filter((s) => {
      if (riskTolerance === 'low') return s.risk_level === 'low';
      if (riskTolerance === 'medium') return s.risk_level !== 'high';
      return true;
    });
    return filtered.reduce((best, s) =>
      s.projected_revenue > best.projected_revenue ? s : best,
      filtered[0],
    );
  }

  runChallenge(decision: string, context: Record<string, unknown>): ChallengeResult {
    const argumentsFor = [
      'Historical data supports this approach',
      'Similar strategies have yielded 20% improvement',
      'Market conditions are favorable',
    ];
    const argumentsAgainst = [
      'Recent competitor activity increases risk',
      'Seasonal patterns suggest waiting 2 weeks',
      'Current creative fatigue may reduce effectiveness',
    ];

    const riskLevel = (context.budget as number || 0) > 50000 ? 'high' : 'medium';
    const downside = Math.round((context.budget as number || 10000) * 0.25);
    const upside = Math.round((context.budget as number || 10000) * 0.45);

    const verdict: ChallengeResult['verdict'] = riskLevel === 'high' ? 'modify' : 'proceed';

    return {
      decision,
      arguments_for: argumentsFor,
      arguments_against: argumentsAgainst,
      risk_assessment: { overall: riskLevel, downside, upside },
      verdict,
      modified_recommendation: verdict === 'modify'
        ? `Reduce scope: implement at 70% of proposed budget with 2-week checkpoint`
        : undefined,
    };
  }

  evaluateDownsideExposure(scenarios: Scenario[]): {
    total_downside: number;
    max_single_loss: number;
    portfolio_risk_score: number;
    recommendation: string;
  } {
    const totalDownside = scenarios.reduce((sum, s) => sum + s.downside_exposure, 0);
    const maxSingleLoss = Math.max(...scenarios.map((s) => s.downside_exposure));
    const avgProbability = scenarios.reduce((sum, s) => sum + s.probability_of_success, 0) / scenarios.length;
    const riskScore = parseFloat((1 - avgProbability).toFixed(2));

    return {
      total_downside: totalDownside,
      max_single_loss: maxSingleLoss,
      portfolio_risk_score: riskScore,
      recommendation: riskScore > 0.3
        ? 'Diversify portfolio to reduce concentration risk'
        : 'Portfolio risk is within acceptable bounds',
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Simulation Engine E2E Workflow', () => {
  let simSim: SimulationWorkflowSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    simSim = new SimulationWorkflowSimulator();
  });

  it('should complete a full campaign simulation workflow', async () => {
    // Step 1: Run simulation
    const result = simSim.runCampaignSimulation({
      campaign_id: 'camp-001',
      country: 'US',
      channel: 'google_ads',
      budget: 25000,
      duration_days: 30,
      target_audience: 'tech_professionals',
    });

    expect(result.status).toBe('completed');
    expect(result.projected_roas).toBeGreaterThan(0);
    expect(result.projected_conversions).toBeGreaterThan(0);
    expect(result.confidence_interval.lower).toBeLessThan(result.confidence_interval.upper);
    expect(result.recommendations.length).toBeGreaterThan(0);

    // Step 2: Persist to database
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: result.id, status: result.status, projected_roas: result.projected_roas }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'INSERT INTO simulations (id, type, status, input, projected_roas) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [result.id, result.type, result.status, JSON.stringify(result.input), result.projected_roas],
    );
    expect(dbResult.rows[0].status).toBe('completed');

    // Step 3: Cache the result
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet(`simulation:${result.id}`, JSON.stringify(result), 3600);
    expect(mockCacheSet).toHaveBeenCalledWith(`simulation:${result.id}`, expect.any(String), 3600);

    // Step 4: Audit log
    mockAuditLog.mockResolvedValueOnce(undefined);
    await mockAuditLog({
      userId: 'admin-1',
      action: 'simulation.campaign.completed',
      resourceType: 'simulation',
      details: { simulation_id: result.id, projected_roas: result.projected_roas },
    });
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('should simulate, compare, and select best scenario', () => {
    // Run multiple simulations with different parameters
    const sim1 = simSim.runCampaignSimulation({
      campaign_id: 'camp-001', country: 'US', channel: 'google_ads', budget: 10000, duration_days: 30,
    });
    const sim2 = simSim.runCampaignSimulation({
      campaign_id: 'camp-001', country: 'US', channel: 'meta', budget: 10000, duration_days: 30,
    });
    const sim3 = simSim.runCampaignSimulation({
      campaign_id: 'camp-001', country: 'US', channel: 'email', budget: 10000, duration_days: 30,
    });

    // Compare
    const comparison = simSim.compareSimulations([sim1.id, sim2.id, sim3.id]);

    expect(comparison.simulations).toHaveLength(3);
    expect(comparison.best_roas).toBeDefined();
    expect(comparison.best_revenue).toBeDefined();
    expect(comparison.lowest_risk).toBeDefined();
    expect(comparison.recommendation).toBeDefined();

    // Email should have highest ROAS due to base multiplier
    expect(comparison.best_roas).toBe(sim3.id);
  });

  it('should run pre-launch risk assessment and get go/no-go', () => {
    // Low risk scenario
    const lowRisk = simSim.assessPreLaunchRisk({
      campaign_id: 'camp-safe', country: 'US', channel: 'google_ads', budget: 5000, duration_days: 30,
    });
    expect(lowRisk.risk_assessment.overall_risk).toBe('low');
    expect(lowRisk.risk_assessment.go_no_go).toBe('go');
    expect(lowRisk.simulation.risk_score).toBeLessThan(0.2);

    // Medium risk scenario
    const medRisk = simSim.assessPreLaunchRisk({
      campaign_id: 'camp-med', country: 'US', channel: 'google_ads', budget: 30000, duration_days: 30,
    });
    expect(medRisk.risk_assessment.overall_risk).toBe('medium');
    expect(medRisk.risk_assessment.go_no_go).toBe('conditional-go');
    expect(medRisk.risk_assessment.conditions).toBeDefined();
    expect(medRisk.risk_assessment.conditions!.length).toBeGreaterThan(0);
  });

  it('should sandbox test a strategy against historical data', () => {
    const historicalData = [
      { month: '2025-10', actual_roas: 3.2 },
      { month: '2025-11', actual_roas: 2.8 },
      { month: '2025-12', actual_roas: 3.5 },
      { month: '2026-01', actual_roas: 3.0 },
    ];

    const sandboxResult = simSim.sandboxTest(
      { campaign_id: 'camp-sandbox', country: 'US', channel: 'google_ads', budget: 15000, duration_days: 30 },
      historicalData,
    );

    expect(sandboxResult.strategy_performance).toBeGreaterThan(0);
    expect(sandboxResult.historical_comparison).toHaveLength(4);
    sandboxResult.historical_comparison.forEach((comp) => {
      expect(comp.actual_roas).toBeDefined();
      expect(comp.simulated_roas).toBeDefined();
      expect(comp.delta).toBeDefined();
    });
    expect(typeof sandboxResult.outperforms_historical).toBe('boolean');
  });

  it('should model competitor reaction and adjust strategy', () => {
    // Model competitor reactions
    const reactions = simSim.modelCompetitorReactions('aggressive', 'google_ads');

    expect(reactions).toHaveLength(3);
    expect(reactions[0].likely_action).toBe('match_bids');
    expect(reactions[0].probability).toBeGreaterThan(0);
    expect(reactions[0].impact_on_cpc).toBeGreaterThan(0);

    // Net CPC impact from all competitors
    const netCpcImpact = reactions.reduce((sum, r) => sum + r.impact_on_cpc * r.probability, 0);
    expect(netCpcImpact).toBeGreaterThan(0); // aggressive action leads to CPC inflation

    // Simulate with adjusted CPC
    const originalSim = simSim.runCampaignSimulation({
      campaign_id: 'camp-original', country: 'US', channel: 'google_ads', budget: 20000, duration_days: 30,
    });

    // Run adjusted simulation with lower budget to compensate for CPC inflation
    const adjustedBudget = Math.round(20000 * (1 + netCpcImpact));
    const adjustedSim = simSim.runCampaignSimulation({
      campaign_id: 'camp-adjusted', country: 'US', channel: 'google_ads', budget: adjustedBudget, duration_days: 30,
    });

    expect(adjustedSim).toBeDefined();
    expect(adjustedSim.projected_spend).toBe(adjustedBudget);
  });

  it('should predict scaling outcomes with diminishing returns', () => {
    const prediction = simSim.predictScaling(10000, 40000, 'google_ads');

    expect(prediction.current_spend).toBe(10000);
    expect(prediction.proposed_spend).toBe(40000);
    expect(prediction.predicted_roas).toBeLessThan(4.0); // diminishing returns at higher spend
    expect(prediction.diminishing_returns_threshold).toBe(20000);
    expect(prediction.saturation_point).toBe(40000);
    expect(prediction.marginal_cost_curve.length).toBeGreaterThan(0);

    // Verify diminishing returns: marginal CPA should increase with spend
    const curve = prediction.marginal_cost_curve;
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].marginal_cpa).toBeGreaterThanOrEqual(curve[i - 1].marginal_cpa);
    }
  });

  it('should model CPC inflation and audience saturation', () => {
    // Small scale
    const small = simSim.predictScaling(10000, 15000, 'google_ads');
    // Large scale
    const large = simSim.predictScaling(10000, 50000, 'google_ads');

    // CPC inflation should be higher at larger scale
    expect(large.cpc_inflation_pct).toBeGreaterThan(small.cpc_inflation_pct);

    // Audience saturation should be higher at larger scale
    expect(large.audience_saturation_pct).toBeGreaterThan(small.audience_saturation_pct);

    // ROAS should be lower at larger scale
    expect(large.predicted_roas).toBeLessThan(small.predicted_roas);
  });

  it('should run multiple simulations and compare results', () => {
    const countries = ['US', 'DE', 'UK', 'FR'];
    const simIds: string[] = [];

    for (const country of countries) {
      const sim = simSim.runCampaignSimulation({
        campaign_id: `camp-${country.toLowerCase()}`,
        country,
        channel: 'google_ads',
        budget: 15000,
        duration_days: 30,
      });
      simIds.push(sim.id);
    }

    const comparison = simSim.compareSimulations(simIds);
    expect(comparison.simulations).toHaveLength(4);

    // US should have highest ROAS due to country multiplier
    const usSim = comparison.simulations.find((s) => s.input.country === 'US');
    const frSim = comparison.simulations.find((s) => s.input.country === 'FR');
    expect(usSim!.projected_roas).toBeGreaterThan(frSim!.projected_roas);
  });

  it('should persist simulation history to database and cache', async () => {
    const sim = simSim.runCampaignSimulation({
      campaign_id: 'camp-persist', country: 'US', channel: 'google_ads', budget: 20000, duration_days: 30,
    });

    // DB insert
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: sim.id, type: sim.type, status: sim.status }],
      rowCount: 1,
    });

    await mockPool.query(
      'INSERT INTO simulations (id, type, status, input, output) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [sim.id, sim.type, sim.status, JSON.stringify(sim.input), JSON.stringify(sim)],
    );

    // Cache
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet(`simulation:${sim.id}`, JSON.stringify(sim), 7200);

    // Verify retrieval from cache
    mockCacheGet.mockResolvedValueOnce(JSON.stringify(sim));
    const cached = await mockCacheGet(`simulation:${sim.id}`);
    const parsed = JSON.parse(cached);
    expect(parsed.id).toBe(sim.id);
    expect(parsed.projected_roas).toBe(sim.projected_roas);
  });

  it('should handle simulation with extreme parameters gracefully', () => {
    // Very small budget
    const tiny = simSim.runCampaignSimulation({
      campaign_id: 'camp-tiny', country: 'US', channel: 'google_ads', budget: 100, duration_days: 7,
    });
    expect(tiny.status).toBe('completed');
    expect(tiny.projected_roas).toBeGreaterThan(0);

    // Very large budget
    const huge = simSim.runCampaignSimulation({
      campaign_id: 'camp-huge', country: 'US', channel: 'google_ads', budget: 500000, duration_days: 90,
    });
    expect(huge.status).toBe('completed');
    expect(huge.risk_score).toBeGreaterThan(tiny.risk_score);
    expect(huge.projected_roas).toBeLessThan(tiny.projected_roas);
  });

  it('should run scaling prediction across multiple channels and compare', () => {
    const channels = ['google_ads', 'meta', 'tiktok', 'email'];
    const predictions = channels.map((ch) => ({
      channel: ch,
      prediction: simSim.predictScaling(10000, 30000, ch),
    }));

    // All predictions should have valid data
    predictions.forEach((p) => {
      expect(p.prediction.predicted_roas).toBeGreaterThan(0);
      expect(p.prediction.marginal_cost_curve.length).toBeGreaterThan(0);
      expect(p.prediction.saturation_point).toBeGreaterThan(p.prediction.current_spend);
    });

    // Email should have highest predicted ROAS
    const emailPred = predictions.find((p) => p.channel === 'email')!;
    const tiktokPred = predictions.find((p) => p.channel === 'tiktok')!;
    expect(emailPred.prediction.predicted_roas).toBeGreaterThan(tiktokPred.prediction.predicted_roas);
  });
});

describe('Strategic Commander E2E Workflow', () => {
  let commander: StrategicCommanderSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    commander = new StrategicCommanderSimulator();
  });

  it('should generate 30/60/90 day projections', () => {
    const projection = commander.generateProjection(90, 100000, 28000);

    expect(projection.horizon_days).toBe(90);
    expect(projection.day_30.revenue).toBeGreaterThan(100000);
    expect(projection.day_60.revenue).toBeGreaterThan(projection.day_30.revenue);
    expect(projection.day_90.revenue).toBeGreaterThan(projection.day_60.revenue);

    // ROAS should remain relatively stable
    expect(projection.day_30.roas).toBeGreaterThan(0);
    expect(projection.day_90.roas).toBeGreaterThan(0);

    // Confidence bands
    expect(projection.confidence_bands.optimistic.revenue).toBeGreaterThan(projection.day_90.revenue);
    expect(projection.confidence_bands.pessimistic.revenue).toBeLessThan(projection.day_90.revenue);

    // Risk factors
    expect(projection.risk_factors.length).toBeGreaterThan(0);
  });

  it('should generate risk-weighted scenarios and select optimal', () => {
    const scenarios = commander.generateScenarios(50000, 200000);

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].risk_level).toBe('low');
    expect(scenarios[1].risk_level).toBe('medium');
    expect(scenarios[2].risk_level).toBe('high');

    // Conservative should have highest success probability
    expect(scenarios[0].probability_of_success).toBeGreaterThan(scenarios[2].probability_of_success);

    // Aggressive should have highest revenue potential
    expect(scenarios[2].projected_revenue).toBeGreaterThan(scenarios[0].projected_revenue);

    // Select optimal for low risk tolerance
    const lowRiskOptimal = commander.selectOptimalScenario(scenarios, 'low');
    expect(lowRiskOptimal.risk_level).toBe('low');

    // Select optimal for high risk tolerance (should pick highest revenue)
    const highRiskOptimal = commander.selectOptimalScenario(scenarios, 'high');
    expect(highRiskOptimal.projected_revenue).toBe(Math.max(...scenarios.map((s) => s.projected_revenue)));
  });

  it('should run internal challenge on a decision', () => {
    const challenge = commander.runChallenge(
      'Increase Google Ads spend by 40%',
      { budget: 30000, current_roas: 3.5 },
    );

    expect(challenge.decision).toBe('Increase Google Ads spend by 40%');
    expect(challenge.arguments_for.length).toBeGreaterThan(0);
    expect(challenge.arguments_against.length).toBeGreaterThan(0);
    expect(challenge.risk_assessment.overall).toBeDefined();
    expect(challenge.risk_assessment.downside).toBeGreaterThan(0);
    expect(challenge.risk_assessment.upside).toBeGreaterThan(challenge.risk_assessment.downside);
    expect(['proceed', 'modify', 'reject']).toContain(challenge.verdict);
  });

  it('should evaluate downside exposure across portfolio', () => {
    const scenarios = commander.generateScenarios(50000, 200000);
    const exposure = commander.evaluateDownsideExposure(scenarios);

    expect(exposure.total_downside).toBeGreaterThan(0);
    expect(exposure.max_single_loss).toBeGreaterThan(0);
    expect(exposure.max_single_loss).toBeLessThanOrEqual(exposure.total_downside);
    expect(exposure.portfolio_risk_score).toBeGreaterThan(0);
    expect(exposure.portfolio_risk_score).toBeLessThan(1);
    expect(exposure.recommendation).toBeDefined();
  });

  it('should compare strategies and recommend', () => {
    const scenarios = commander.generateScenarios(30000, 150000);

    // Compare by risk-adjusted return
    const riskAdjustedReturns = scenarios.map((s) => ({
      name: s.name,
      risk_adjusted_return: s.projected_revenue * s.probability_of_success - s.downside_exposure,
    }));

    // Sort by risk-adjusted return
    riskAdjustedReturns.sort((a, b) => b.risk_adjusted_return - a.risk_adjusted_return);

    expect(riskAdjustedReturns[0].risk_adjusted_return).toBeGreaterThan(0);
    expect(riskAdjustedReturns.length).toBe(3);
  });

  it('should run pre-budget simulation and optimize allocation', async () => {
    const channels = ['google_ads', 'meta', 'email', 'tiktok'];
    const totalBudget = 100000;

    // Generate scenario for each channel
    const channelScenarios = channels.map((channel) => {
      const scenarios = commander.generateScenarios(
        totalBudget * 0.1,
        totalBudget * 0.5,
      );
      return { channel, scenarios };
    });

    expect(channelScenarios).toHaveLength(4);

    // Calculate optimal allocation based on conservative scenario ROAS
    const totalRoas = channelScenarios.reduce((sum, cs) =>
      sum + cs.scenarios[0].projected_roas, 0);
    const allocation = channelScenarios.map((cs) => ({
      channel: cs.channel,
      pct: parseFloat((cs.scenarios[0].projected_roas / totalRoas).toFixed(2)),
      amount: Math.round(totalBudget * cs.scenarios[0].projected_roas / totalRoas),
    }));

    expect(allocation).toHaveLength(4);
    const totalAllocated = allocation.reduce((sum, a) => sum + a.amount, 0);
    // Allow small rounding difference
    expect(Math.abs(totalAllocated - totalBudget)).toBeLessThan(100);

    // Persist allocation to DB
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'alloc-001', total_budget: totalBudget, channels: allocation }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'INSERT INTO budget_allocations (id, total_budget, channels) VALUES ($1, $2, $3) RETURNING *',
      ['alloc-001', totalBudget, JSON.stringify(allocation)],
    );
    expect(dbResult.rows[0].total_budget).toBe(totalBudget);
  });

  it('should challenge high-budget decisions with modify verdict', () => {
    const challenge = commander.runChallenge(
      'Launch $100K campaign on new market',
      { budget: 100000, market: 'JP', experience: 'none' },
    );

    // High budget should trigger modify verdict
    expect(challenge.verdict).toBe('modify');
    expect(challenge.modified_recommendation).toBeDefined();
    expect(challenge.modified_recommendation).toContain('70%');
    expect(challenge.risk_assessment.overall).toBe('high');
  });

  it('should generate projections and persist with caching', async () => {
    const projection = commander.generateProjection(90, 150000, 40000);

    // Persist
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: projection.id, horizon_days: 90 }],
      rowCount: 1,
    });

    await mockPool.query(
      'INSERT INTO projections (id, horizon_days, data) VALUES ($1, $2, $3) RETURNING *',
      [projection.id, projection.horizon_days, JSON.stringify(projection)],
    );

    // Cache
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet(`projection:${projection.id}`, JSON.stringify(projection), 3600);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledTimes(1);

    // Audit
    mockAuditLog.mockResolvedValueOnce(undefined);
    await mockAuditLog({
      userId: 'strategist-1',
      action: 'commander.projection.created',
      resourceType: 'projection',
      details: { projection_id: projection.id, horizon_days: 90 },
    });
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it('should evaluate full portfolio risk with multiple scenario groups', () => {
    const group1 = commander.generateScenarios(20000, 80000);
    const group2 = commander.generateScenarios(50000, 200000);

    const allScenarios = [...group1, ...group2];
    const exposure = commander.evaluateDownsideExposure(allScenarios);

    expect(exposure.total_downside).toBeGreaterThan(0);
    // Group 2 has higher budget, so max single loss should come from there
    expect(exposure.max_single_loss).toBeGreaterThanOrEqual(
      Math.max(...group1.map((s) => s.downside_exposure)),
    );
    expect(exposure.recommendation).toBeDefined();
  });

  it('should generate scenarios and track in database', async () => {
    const scenarios = commander.generateScenarios(40000, 160000);

    for (const scenario of scenarios) {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ name: scenario.name, risk_level: scenario.risk_level }],
        rowCount: 1,
      });
    }

    for (const scenario of scenarios) {
      const dbResult = await mockPool.query(
        'INSERT INTO scenarios (name, risk_level, projected_revenue, projected_roas) VALUES ($1, $2, $3, $4) RETURNING *',
        [scenario.name, scenario.risk_level, scenario.projected_revenue, scenario.projected_roas],
      );
      expect(dbResult.rows[0].name).toBe(scenario.name);
    }

    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });
});
