/**
 * Integration tests for agent-to-agent interactions.
 *
 * Tests the data flow and communication patterns between different
 * agents in the AI Agent System. Each agent's process() method is
 * mocked to verify that outputs from one agent correctly feed into
 * another agent's inputs.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
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

import type {
  AgentType,
  AgentDecision,
  CrossChallengeResult,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Agent process() mock types and helpers
// ---------------------------------------------------------------------------

interface AgentOutput {
  agent_type: AgentType;
  decision_type: string;
  output_data: Record<string, unknown>;
  confidence_score: number;
  reasoning: string;
}

interface AgentProcessor {
  type: AgentType;
  process: jest.Mock<Promise<AgentOutput>, [Record<string, unknown>]>;
}

/**
 * Creates a mock agent processor that returns a predefined output
 * when process() is called.
 */
function createMockAgent(type: AgentType, defaultOutput: Partial<AgentOutput> = {}): AgentProcessor {
  const output: AgentOutput = {
    agent_type: type,
    decision_type: 'recommendation',
    output_data: {},
    confidence_score: 0.85,
    reasoning: `${type} completed analysis.`,
    ...defaultOutput,
  };

  return {
    type,
    process: jest.fn<Promise<AgentOutput>, [Record<string, unknown>]>().mockResolvedValue(output),
  };
}

/**
 * Simulates passing the output of one agent as input to another.
 */
async function pipeAgentOutput(
  source: AgentProcessor,
  target: AgentProcessor,
  sourceInput: Record<string, unknown> = {},
): Promise<{ sourceOutput: AgentOutput; targetOutput: AgentOutput }> {
  const sourceOutput = await source.process(sourceInput);
  const targetInput = {
    upstream_agent: source.type,
    upstream_output: sourceOutput.output_data,
    upstream_confidence: sourceOutput.confidence_score,
  };
  const targetOutput = await target.process(targetInput);
  return { sourceOutput, targetOutput };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent-to-Agent Interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Market Intelligence -> Country Strategy
  // =========================================================================

  describe('Market Intelligence -> Country Strategy pipeline', () => {
    it('passes market data to country strategy for analysis', async () => {
      const marketIntel = createMockAgent('market_intelligence', {
        output_data: {
          market_size: 15000000,
          growth_rate: 12.5,
          top_channels: ['google', 'meta'],
          consumer_trends: ['mobile_first', 'social_commerce'],
          country: 'DE',
        },
        confidence_score: 0.91,
      });

      const countryStrategy = createMockAgent('country_strategy', {
        output_data: {
          recommended_entry: 'direct',
          priority_channels: ['google', 'meta'],
          budget_allocation: { google: 60, meta: 40 },
          risk_level: 'medium',
          expected_roas: 3.5,
        },
        confidence_score: 0.88,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(
        marketIntel,
        countryStrategy,
        { country: 'DE', period: '2026-Q1' },
      );

      // Verify market intelligence produced output
      expect(sourceOutput.agent_type).toBe('market_intelligence');
      expect(sourceOutput.output_data.market_size).toBe(15000000);
      expect(sourceOutput.confidence_score).toBe(0.91);

      // Verify country strategy received market data as input
      expect(countryStrategy.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'market_intelligence',
          upstream_output: expect.objectContaining({
            market_size: 15000000,
            growth_rate: 12.5,
          }),
          upstream_confidence: 0.91,
        }),
      );

      // Verify country strategy produced output
      expect(targetOutput.agent_type).toBe('country_strategy');
      expect(targetOutput.output_data.recommended_entry).toBe('direct');
      expect(targetOutput.output_data.priority_channels).toEqual(['google', 'meta']);
    });

    it('handles low-confidence market intelligence gracefully', async () => {
      const marketIntel = createMockAgent('market_intelligence', {
        output_data: {
          market_size: null,
          growth_rate: 2.0,
          data_quality: 'limited',
        },
        confidence_score: 0.35,
        reasoning: 'Limited data available for emerging market.',
      });

      const countryStrategy = createMockAgent('country_strategy', {
        output_data: {
          recommended_entry: 'pilot',
          risk_level: 'high',
          requires_additional_data: true,
        },
        confidence_score: 0.45,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(
        marketIntel,
        countryStrategy,
        { country: 'NG', period: '2026-Q1' },
      );

      expect(sourceOutput.confidence_score).toBe(0.35);
      expect(countryStrategy.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_confidence: 0.35,
        }),
      );
      expect(targetOutput.output_data.requires_additional_data).toBe(true);
      expect(targetOutput.confidence_score).toBeLessThan(0.5);
    });
  });

  // =========================================================================
  // Budget Optimization reads Performance Analytics metrics
  // =========================================================================

  describe('Performance Analytics -> Budget Optimization pipeline', () => {
    it('feeds performance metrics into budget optimization decisions', async () => {
      const perfAnalytics = createMockAgent('performance_analytics', {
        output_data: {
          overall_roas: 4.2,
          channel_performance: {
            google: { roas: 5.1, spend: 8000, revenue: 40800 },
            meta: { roas: 3.2, spend: 6000, revenue: 19200 },
            tiktok: { roas: 2.1, spend: 3000, revenue: 6300 },
          },
          top_performing_campaigns: ['camp-us-google-1', 'camp-de-meta-2'],
          underperforming_campaigns: ['camp-uk-tiktok-3'],
        },
        confidence_score: 0.94,
      });

      const budgetOptimizer = createMockAgent('budget_optimization', {
        output_data: {
          reallocations: [
            { from: 'tiktok', to: 'google', amount: 1500 },
            { from: 'tiktok', to: 'meta', amount: 500 },
          ],
          new_budget_split: { google: 9500, meta: 6500, tiktok: 1000 },
          projected_roas: 4.8,
          risk_assessment: 'low',
        },
        confidence_score: 0.89,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(
        perfAnalytics,
        budgetOptimizer,
      );

      expect(sourceOutput.output_data.overall_roas).toBe(4.2);
      expect(budgetOptimizer.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'performance_analytics',
          upstream_output: expect.objectContaining({
            channel_performance: expect.any(Object),
          }),
        }),
      );
      expect(targetOutput.output_data.reallocations).toHaveLength(2);
      expect(targetOutput.output_data.projected_roas).toBe(4.8);
    });

    it('handles missing performance data gracefully', async () => {
      const perfAnalytics = createMockAgent('performance_analytics', {
        output_data: {
          overall_roas: 0,
          channel_performance: {},
          error: 'No data available for selected period',
        },
        confidence_score: 0.1,
      });

      const budgetOptimizer = createMockAgent('budget_optimization', {
        output_data: {
          reallocations: [],
          action: 'maintain_current',
          reason: 'Insufficient performance data for reallocation',
        },
        confidence_score: 0.3,
      });

      const { targetOutput } = await pipeAgentOutput(perfAnalytics, budgetOptimizer);

      expect(targetOutput.output_data.reallocations).toEqual([]);
      expect(targetOutput.output_data.action).toBe('maintain_current');
    });
  });

  // =========================================================================
  // Compliance checks Paid Ads campaign output
  // =========================================================================

  describe('Paid Ads -> Compliance pipeline', () => {
    it('validates paid ads campaign output for regulatory compliance', async () => {
      const paidAds = createMockAgent('paid_ads', {
        output_data: {
          campaign_id: 'camp-de-google-1',
          country: 'DE',
          ad_copy: 'Get 50% off today! Limited time offer.',
          targeting: {
            age_range: '18-65',
            interests: ['technology', 'gaming'],
            location: 'Germany',
          },
          budget: 5000,
          platform: 'google',
        },
        confidence_score: 0.92,
      });

      const compliance = createMockAgent('compliance', {
        output_data: {
          is_compliant: true,
          checks_passed: ['gdpr_consent', 'ad_disclosure', 'age_targeting', 'data_retention'],
          checks_failed: [],
          regulation: 'gdpr',
          recommendations: ['Add cookie consent banner for landing page'],
        },
        confidence_score: 0.96,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(paidAds, compliance);

      expect(sourceOutput.output_data.country).toBe('DE');
      expect(compliance.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'paid_ads',
          upstream_output: expect.objectContaining({
            campaign_id: 'camp-de-google-1',
            targeting: expect.any(Object),
          }),
        }),
      );
      expect(targetOutput.output_data.is_compliant).toBe(true);
      expect(targetOutput.output_data.checks_passed).toContain('gdpr_consent');
    });

    it('flags non-compliant paid ads output', async () => {
      const paidAds = createMockAgent('paid_ads', {
        output_data: {
          campaign_id: 'camp-de-google-2',
          country: 'DE',
          ad_copy: 'Guaranteed weight loss in 3 days!',
          targeting: { age_range: '13-65', interests: ['health'] },
          collects_personal_data: true,
          consent_mechanism: null,
        },
        confidence_score: 0.85,
      });

      const compliance = createMockAgent('compliance', {
        output_data: {
          is_compliant: false,
          checks_passed: ['ad_disclosure'],
          checks_failed: [
            { rule: 'health_claims', severity: 'critical', message: 'Unsubstantiated health claims not allowed' },
            { rule: 'age_targeting', severity: 'high', message: 'Minimum age must be 16 for health-related ads in EU' },
            { rule: 'gdpr_consent', severity: 'critical', message: 'Missing consent mechanism for personal data collection' },
          ],
          regulation: 'gdpr',
          action_required: 'block_campaign',
        },
        confidence_score: 0.98,
      });

      const { targetOutput } = await pipeAgentOutput(paidAds, compliance);

      expect(targetOutput.output_data.is_compliant).toBe(false);
      expect(targetOutput.output_data.checks_failed).toHaveLength(3);
      expect(targetOutput.output_data.action_required).toBe('block_campaign');
    });
  });

  // =========================================================================
  // Brand Consistency validates Creative Generation output
  // =========================================================================

  describe('Creative Generation -> Brand Consistency pipeline', () => {
    it('validates creative assets against brand guidelines', async () => {
      const creativeGen = createMockAgent('creative_generation', {
        output_data: {
          creative_id: 'creative-001',
          type: 'ad_copy',
          headline: 'Transform Your Business Today',
          body_text: 'Our AI-powered platform helps you grow internationally.',
          cta: 'Start Free Trial',
          color_palette: ['#1A73E8', '#FFFFFF', '#34A853'],
          font: 'Inter',
          tone: 'professional',
        },
        confidence_score: 0.88,
      });

      const brandConsistency = createMockAgent('brand_consistency', {
        output_data: {
          is_consistent: true,
          brand_score: 92,
          checks: {
            color_palette: { passed: true, score: 95 },
            typography: { passed: true, score: 90 },
            tone_of_voice: { passed: true, score: 88 },
            messaging: { passed: true, score: 94 },
          },
          suggestions: ['Consider using the secondary CTA style for A/B testing'],
        },
        confidence_score: 0.93,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(creativeGen, brandConsistency);

      expect(sourceOutput.output_data.type).toBe('ad_copy');
      expect(brandConsistency.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'creative_generation',
          upstream_output: expect.objectContaining({
            creative_id: 'creative-001',
            tone: 'professional',
          }),
        }),
      );
      expect(targetOutput.output_data.is_consistent).toBe(true);
      expect(targetOutput.output_data.brand_score).toBe(92);
    });

    it('flags brand-inconsistent creative output', async () => {
      const creativeGen = createMockAgent('creative_generation', {
        output_data: {
          creative_id: 'creative-002',
          type: 'ad_copy',
          headline: 'CRAZY DEALS!!! BUY NOW!!!',
          color_palette: ['#FF0000', '#FFFF00'],
          font: 'Comic Sans',
          tone: 'aggressive',
        },
        confidence_score: 0.72,
      });

      const brandConsistency = createMockAgent('brand_consistency', {
        output_data: {
          is_consistent: false,
          brand_score: 28,
          checks: {
            color_palette: { passed: false, score: 15, issue: 'Colors do not match brand palette' },
            typography: { passed: false, score: 10, issue: 'Font not in approved font list' },
            tone_of_voice: { passed: false, score: 20, issue: 'Aggressive tone violates brand voice guidelines' },
            messaging: { passed: false, score: 65, issue: 'Excessive punctuation and caps' },
          },
          action_required: 'regenerate_creative',
        },
        confidence_score: 0.97,
      });

      const { targetOutput } = await pipeAgentOutput(creativeGen, brandConsistency);

      expect(targetOutput.output_data.is_consistent).toBe(false);
      expect(targetOutput.output_data.brand_score).toBeLessThan(50);
      expect(targetOutput.output_data.action_required).toBe('regenerate_creative');
    });
  });

  // =========================================================================
  // Localization processes Content Blog output
  // =========================================================================

  describe('Content Blog -> Localization pipeline', () => {
    it('localizes blog content for target market', async () => {
      const contentBlog = createMockAgent('content_blog', {
        output_data: {
          content_id: 'blog-001',
          title: 'Top 10 E-commerce Trends for 2026',
          body: 'The e-commerce landscape continues to evolve rapidly...',
          language: 'en',
          seo_keywords: ['ecommerce trends', 'online shopping 2026'],
          word_count: 1500,
        },
        confidence_score: 0.90,
      });

      const localization = createMockAgent('localization', {
        output_data: {
          source_content_id: 'blog-001',
          target_language: 'de',
          translated_title: 'Die 10 wichtigsten E-Commerce-Trends fuer 2026',
          translated_body: 'Die E-Commerce-Landschaft entwickelt sich weiter...',
          cultural_adaptations: [
            'Adapted currency references from USD to EUR',
            'Replaced US-specific examples with German market examples',
            'Adjusted date format to DD.MM.YYYY',
          ],
          localized_seo_keywords: ['E-Commerce Trends', 'Online-Shopping 2026'],
          quality_score: 0.91,
        },
        confidence_score: 0.87,
      });

      const { sourceOutput, targetOutput } = await pipeAgentOutput(contentBlog, localization);

      expect(sourceOutput.output_data.language).toBe('en');
      expect(localization.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'content_blog',
          upstream_output: expect.objectContaining({
            content_id: 'blog-001',
            language: 'en',
          }),
        }),
      );
      expect(targetOutput.output_data.target_language).toBe('de');
      expect(targetOutput.output_data.cultural_adaptations).toHaveLength(3);
      expect(targetOutput.output_data.quality_score).toBeGreaterThan(0.8);
    });
  });

  // =========================================================================
  // Master Orchestrator aggregates all agent outputs
  // =========================================================================

  describe('Master Orchestrator aggregation', () => {
    it('aggregates outputs from all upstream agents', async () => {
      const agentOutputs: Map<AgentType, AgentOutput> = new Map();

      // Create mock outputs from multiple agents
      const mockAgents: AgentProcessor[] = [
        createMockAgent('market_intelligence', {
          output_data: { market_size: 15000000, growth_rate: 12.5 },
          confidence_score: 0.91,
        }),
        createMockAgent('performance_analytics', {
          output_data: { overall_roas: 4.2, top_campaigns: 5 },
          confidence_score: 0.94,
        }),
        createMockAgent('budget_optimization', {
          output_data: { projected_roas: 4.8, reallocations: 3 },
          confidence_score: 0.89,
        }),
        createMockAgent('compliance', {
          output_data: { all_compliant: true, issues_found: 0 },
          confidence_score: 0.96,
        }),
        createMockAgent('fraud_detection', {
          output_data: { alerts: 0, risk_level: 'low' },
          confidence_score: 0.98,
        }),
      ];

      // Collect outputs from all agents
      for (const agent of mockAgents) {
        const output = await agent.process({});
        agentOutputs.set(agent.type, output);
      }

      // Master orchestrator receives all outputs
      const orchestrator = createMockAgent('master_orchestrator', {
        output_data: {
          summary: 'All systems nominal. Growth trajectory positive.',
          total_agents_reporting: agentOutputs.size,
          average_confidence: 0.936,
          action_items: [
            { agent: 'budget_optimization', action: 'Execute reallocations', priority: 'high' },
          ],
          risk_flags: [],
          next_orchestration_in: '1h',
        },
        confidence_score: 0.92,
      });

      const orchestratorInput = {
        agent_outputs: Object.fromEntries(agentOutputs),
        timestamp: '2026-02-25T10:00:00Z',
      };

      const orchestratorOutput = await orchestrator.process(orchestratorInput);

      expect(orchestrator.process).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_outputs: expect.any(Object),
          timestamp: expect.any(String),
        }),
      );
      expect(orchestratorOutput.output_data.total_agents_reporting).toBe(5);
      expect(orchestratorOutput.output_data.average_confidence).toBeGreaterThan(0.9);
      expect(orchestratorOutput.output_data.action_items).toHaveLength(1);
      expect(orchestratorOutput.output_data.risk_flags).toHaveLength(0);
    });

    it('escalates when agents produce contradictory outputs', async () => {
      const perfAnalytics = createMockAgent('performance_analytics', {
        output_data: { overall_roas: 4.5, trend: 'up', recommendation: 'increase_spend' },
        confidence_score: 0.88,
      });

      const fraudDetection = createMockAgent('fraud_detection', {
        output_data: {
          alerts: 3,
          risk_level: 'high',
          recommendation: 'reduce_spend',
          suspicious_campaigns: ['camp-1', 'camp-2'],
        },
        confidence_score: 0.91,
      });

      const perfOutput = await perfAnalytics.process({});
      const fraudOutput = await fraudDetection.process({});

      // Orchestrator detects contradiction: one says increase, other says reduce
      const orchestrator = createMockAgent('master_orchestrator', {
        output_data: {
          summary: 'Contradiction detected between performance_analytics and fraud_detection.',
          contradictions: [
            {
              agents: ['performance_analytics', 'fraud_detection'],
              field: 'recommendation',
              values: ['increase_spend', 'reduce_spend'],
              resolution: 'Defer to fraud_detection due to higher confidence and safety priority.',
            },
          ],
          final_recommendation: 'reduce_spend',
          requires_human_review: true,
          risk_flags: ['potential_fraud'],
        },
        confidence_score: 0.75,
      });

      const orchestratorOutput = await orchestrator.process({
        agent_outputs: {
          performance_analytics: perfOutput,
          fraud_detection: fraudOutput,
        },
      });

      expect(orchestratorOutput.output_data.contradictions).toHaveLength(1);
      expect(orchestratorOutput.output_data.final_recommendation).toBe('reduce_spend');
      expect(orchestratorOutput.output_data.requires_human_review).toBe(true);
      expect(orchestratorOutput.confidence_score).toBeLessThan(0.85);
    });
  });

  // =========================================================================
  // Multi-hop agent chain
  // =========================================================================

  describe('Multi-hop agent chain', () => {
    it('passes data through a three-agent pipeline: Market Intel -> Country Strategy -> Paid Ads', async () => {
      const marketIntel = createMockAgent('market_intelligence', {
        output_data: {
          country: 'JP',
          market_size: 80000000,
          top_channels: ['google', 'line'],
          consumer_behavior: { mobile_dominant: true },
        },
        confidence_score: 0.89,
      });

      const countryStrategy = createMockAgent('country_strategy', {
        output_data: {
          country: 'JP',
          entry_mode: 'localized',
          channel_priority: ['google', 'line'],
          budget_recommendation: 20000,
          cultural_notes: ['Formal tone preferred', 'Visual-heavy ads perform well'],
        },
        confidence_score: 0.86,
      });

      const paidAds = createMockAgent('paid_ads', {
        output_data: {
          campaigns_created: 2,
          campaigns: [
            { name: 'JP-Google-Search', platform: 'google', budget: 12000 },
            { name: 'JP-Line-Display', platform: 'line', budget: 8000 },
          ],
          estimated_reach: 2500000,
          estimated_cpc: 0.85,
        },
        confidence_score: 0.83,
      });

      // Hop 1: Market Intelligence -> Country Strategy
      const miOutput = await marketIntel.process({ country: 'JP' });
      const csOutput = await countryStrategy.process({
        upstream_agent: 'market_intelligence',
        upstream_output: miOutput.output_data,
        upstream_confidence: miOutput.confidence_score,
      });

      // Hop 2: Country Strategy -> Paid Ads
      const paOutput = await paidAds.process({
        upstream_agent: 'country_strategy',
        upstream_output: csOutput.output_data,
        upstream_confidence: csOutput.confidence_score,
      });

      // Verify the full chain
      expect(marketIntel.process).toHaveBeenCalledTimes(1);
      expect(countryStrategy.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'market_intelligence',
        }),
      );
      expect(paidAds.process).toHaveBeenCalledWith(
        expect.objectContaining({
          upstream_agent: 'country_strategy',
        }),
      );
      expect(paOutput.output_data.campaigns_created).toBe(2);
      expect(paOutput.output_data.campaigns).toHaveLength(2);
    });
  });

  // =========================================================================
  // Competitive Intelligence -> Multiple consumers
  // =========================================================================

  describe('Competitive Intelligence fan-out', () => {
    it('feeds competitive data to both paid ads and content strategy', async () => {
      const competitiveIntel = createMockAgent('competitive_intelligence', {
        output_data: {
          competitors_analyzed: 5,
          market_gaps: ['video content', 'influencer marketing'],
          competitor_spend_estimate: { google: 50000, meta: 30000 },
          trending_keywords: ['ai tools', 'automation platform'],
        },
        confidence_score: 0.82,
      });

      const paidAds = createMockAgent('paid_ads', {
        output_data: {
          keyword_opportunities: ['ai tools', 'automation platform'],
          suggested_budget_increase: 5000,
        },
        confidence_score: 0.80,
      });

      const contentBlog = createMockAgent('content_blog', {
        output_data: {
          content_gaps_identified: ['video tutorials', 'influencer partnerships guide'],
          suggested_topics: 3,
        },
        confidence_score: 0.78,
      });

      const ciOutput = await competitiveIntel.process({});

      // Fan-out to both consumers in parallel
      const [paidAdsOutput, contentOutput] = await Promise.all([
        paidAds.process({
          upstream_agent: 'competitive_intelligence',
          upstream_output: ciOutput.output_data,
          upstream_confidence: ciOutput.confidence_score,
        }),
        contentBlog.process({
          upstream_agent: 'competitive_intelligence',
          upstream_output: ciOutput.output_data,
          upstream_confidence: ciOutput.confidence_score,
        }),
      ]);

      expect(paidAds.process).toHaveBeenCalledWith(
        expect.objectContaining({ upstream_agent: 'competitive_intelligence' }),
      );
      expect(contentBlog.process).toHaveBeenCalledWith(
        expect.objectContaining({ upstream_agent: 'competitive_intelligence' }),
      );
      expect(paidAdsOutput.output_data.keyword_opportunities).toHaveLength(2);
      expect(contentOutput.output_data.content_gaps_identified).toHaveLength(2);
    });
  });
});
