// ============================================================
// AI International Growth Engine - Gap Reporter
// Identifies data gaps and strategy blind spots across agent outputs.
// Generates reports with critical gaps and actionable recommendations.
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';
import type { Gap, GapReport, GapReportRow } from './types';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

// ---- Expected Data Coverage ----

/**
 * Mapping of agent types to the data fields they are expected to provide.
 * When an agent's output is missing these fields, a data gap is reported.
 */
const EXPECTED_DATA_FIELDS: Partial<Record<AgentType, string[]>> = {
  market_intelligence: [
    'market_size', 'growth_rate', 'key_trends', 'demand_signals',
    'competitive_landscape', 'market_risks',
  ],
  country_strategy: [
    'target_markets', 'priority_ranking', 'entry_strategy',
    'resource_requirements', 'timeline', 'risk_assessment',
  ],
  paid_ads: [
    'channel_allocation', 'targeting_strategy', 'bid_strategy',
    'budget_pacing', 'expected_performance', 'audience_segments',
  ],
  organic_social: [
    'platform_strategy', 'content_calendar', 'engagement_targets',
    'audience_growth', 'posting_frequency',
  ],
  content_blog: [
    'content_topics', 'keyword_strategy', 'publishing_schedule',
    'seo_targets', 'content_types',
  ],
  creative_generation: [
    'creative_formats', 'design_guidelines', 'asset_inventory',
    'performance_benchmarks', 'variation_count',
  ],
  performance_analytics: [
    'kpi_dashboard', 'attribution_model', 'conversion_funnel',
    'channel_performance', 'trend_analysis',
  ],
  budget_optimization: [
    'total_budget', 'channel_allocations', 'efficiency_metrics',
    'guardrails', 'reallocation_triggers',
  ],
  ab_testing: [
    'active_tests', 'test_results', 'statistical_significance',
    'sample_sizes', 'winning_variants',
  ],
  conversion_optimization: [
    'funnel_analysis', 'drop_off_points', 'optimization_targets',
    'page_performance', 'ux_recommendations',
  ],
  shopify_integration: [
    'product_sync_status', 'order_metrics', 'inventory_levels',
    'checkout_performance', 'integration_health',
  ],
  localization: [
    'language_coverage', 'translation_quality', 'cultural_adaptations',
    'market_fit_scores', 'pending_translations',
  ],
  compliance: [
    'regulation_coverage', 'compliance_status', 'risk_flags',
    'audit_schedule', 'remediation_items',
  ],
  competitive_intelligence: [
    'competitor_analysis', 'market_share', 'competitive_moves',
    'threat_assessment', 'opportunity_gaps',
  ],
  fraud_detection: [
    'fraud_signals', 'anomaly_count', 'risk_score',
    'blocked_traffic', 'investigation_queue',
  ],
  brand_consistency: [
    'brand_score', 'guideline_violations', 'tone_analysis',
    'visual_consistency', 'cross_channel_alignment',
  ],
  data_engineering: [
    'pipeline_health', 'data_freshness', 'ingestion_status',
    'schema_validation', 'error_rates',
  ],
  enterprise_security: [
    'threat_level', 'vulnerability_count', 'incident_status',
    'access_audit', 'encryption_coverage',
  ],
  revenue_forecasting: [
    'projected_revenue', 'forecast_accuracy', 'growth_projections',
    'risk_factors', 'confidence_intervals',
  ],
  master_orchestrator: [
    'system_health', 'agent_status', 'coordination_metrics',
    'decision_queue', 'escalation_items',
  ],
};

/**
 * Strategic dimensions that should be covered across the agent outputs
 * collectively. When none of the agents address a dimension, a strategy
 * gap is reported.
 */
const STRATEGIC_DIMENSIONS = [
  {
    dimension: 'market_entry_timing',
    description: 'When to enter new markets and sequencing of market launches',
    relevantAgents: ['country_strategy', 'market_intelligence', 'revenue_forecasting'] as AgentType[],
    keywords: ['timing', 'launch', 'sequence', 'phase', 'rollout', 'entry_date'],
  },
  {
    dimension: 'cross_channel_synergy',
    description: 'How paid, organic, and content channels work together',
    relevantAgents: ['paid_ads', 'organic_social', 'content_blog'] as AgentType[],
    keywords: ['synergy', 'cross_channel', 'integrated', 'multi_channel', 'omnichannel'],
  },
  {
    dimension: 'competitive_response',
    description: 'How to respond to competitive threats and market changes',
    relevantAgents: ['competitive_intelligence', 'paid_ads', 'creative_generation'] as AgentType[],
    keywords: ['competitive', 'response', 'counter', 'defend', 'position'],
  },
  {
    dimension: 'budget_contingency',
    description: 'Contingency plans for budget overruns or underperformance',
    relevantAgents: ['budget_optimization', 'revenue_forecasting', 'master_orchestrator'] as AgentType[],
    keywords: ['contingency', 'fallback', 'reserve', 'emergency', 'reallocation'],
  },
  {
    dimension: 'customer_journey_coherence',
    description: 'End-to-end customer experience from awareness to purchase',
    relevantAgents: ['conversion_optimization', 'content_blog', 'shopify_integration'] as AgentType[],
    keywords: ['journey', 'funnel', 'experience', 'touchpoint', 'lifecycle'],
  },
  {
    dimension: 'regulatory_risk_mitigation',
    description: 'Proactive handling of regulatory changes and compliance risks',
    relevantAgents: ['compliance', 'enterprise_security', 'country_strategy'] as AgentType[],
    keywords: ['regulation', 'compliance', 'risk', 'mitigation', 'policy'],
  },
  {
    dimension: 'brand_localization_balance',
    description: 'Balancing global brand consistency with local market adaptation',
    relevantAgents: ['brand_consistency', 'localization', 'creative_generation'] as AgentType[],
    keywords: ['brand', 'localization', 'adaptation', 'consistency', 'global_local'],
  },
  {
    dimension: 'data_driven_decision_loop',
    description: 'Feedback loops from analytics back to strategy and execution',
    relevantAgents: ['performance_analytics', 'ab_testing', 'data_engineering'] as AgentType[],
    keywords: ['feedback', 'loop', 'iteration', 'learning', 'data_driven'],
  },
];

// ---- GapReporter Class ----

/**
 * Identifies and reports data gaps and strategy blind spots across agent outputs.
 *
 * Performs two categories of gap analysis:
 * 1. **Data gaps** - Missing data fields that agents are expected to provide
 * 2. **Strategy gaps** - Strategic dimensions that are not adequately covered
 *    by any agent's output
 *
 * Generates consolidated gap reports with severity classification and
 * actionable recommendations. Reports are persisted to the database
 * for tracking and follow-up.
 *
 * @example
 * ```typescript
 * const reporter = new GapReporter();
 * const gaps = reporter.collectGaps(agentOutputs);
 * const report = reporter.generateGapReport(gaps);
 * await reporter.persistGapReport(report);
 * ```
 */
export class GapReporter {
  /**
   * Collects all gaps (data and strategy) from the agent outputs.
   *
   * @param outputs - Map of all agent outputs keyed by agent type
   * @returns Combined array of data gaps and strategy gaps
   */
  collectGaps(outputs: Map<AgentType, AgentOutput>): Gap[] {
    logger.info('Collecting gaps from agent outputs', { agentCount: outputs.size });

    const dataGaps = this.analyzeDataGaps(outputs);
    const strategyGaps = this.analyzeStrategyGaps(outputs);

    const allGaps = [...dataGaps, ...strategyGaps];

    logger.info('Gap collection completed', {
      total: allGaps.length,
      dataGaps: dataGaps.length,
      strategyGaps: strategyGaps.length,
    });

    return allGaps;
  }

  /**
   * Analyzes agent outputs for missing data fields.
   *
   * Compares each agent's output data against its expected data fields
   * (defined in EXPECTED_DATA_FIELDS). When expected fields are missing
   * or empty, a Gap is created with details about what data is needed.
   *
   * @param outputs - Map of all agent outputs
   * @returns Array of data-related gaps
   */
  analyzeDataGaps(outputs: Map<AgentType, AgentOutput>): Gap[] {
    const gaps: Gap[] = [];

    for (const [agentType, output] of outputs) {
      const expectedFields = EXPECTED_DATA_FIELDS[agentType];
      if (!expectedFields) {
        continue;
      }

      const missingFields: string[] = [];
      const outputDataKeys = output.data
        ? Object.keys(output.data).map((k) => k.toLowerCase().replace(/_/g, ''))
        : [];

      for (const field of expectedFields) {
        const normalizedField = field.toLowerCase().replace(/_/g, '');

        // Check if the field exists in the output data (with normalized matching)
        const hasField = outputDataKeys.some((k) => k === normalizedField);

        if (!hasField) {
          // Also check if the data exists but under a slightly different name
          const hasPartialMatch = outputDataKeys.some(
            (k) => k.includes(normalizedField) || normalizedField.includes(k),
          );

          if (!hasPartialMatch) {
            missingFields.push(field);
          }
        } else {
          // Field exists - check if it's empty
          const value = this.extractValue(output.data, field);
          if (this.isEmptyValue(value)) {
            missingFields.push(field);
          }
        }
      }

      if (missingFields.length > 0) {
        const coverage = ((expectedFields.length - missingFields.length) / expectedFields.length) * 100;
        const impact = missingFields.length > expectedFields.length / 2
          ? 'High: more than half of expected data fields are missing, significantly reducing decision quality'
          : missingFields.length > 2
            ? 'Medium: several expected data fields are missing, which may affect decision accuracy'
            : 'Low: a few data fields are missing but core data is present';

        gaps.push({
          reportedBy: agentType,
          area: 'data_completeness',
          description: `Agent ${agentType} is missing ${missingFields.length}/${expectedFields.length} expected data fields (${coverage.toFixed(0)}% coverage)`,
          dataNeeded: missingFields,
          impact,
        });
      }

      // Check for self-reported uncertainties that indicate data gaps
      if (output.uncertainties && output.uncertainties.length > 0) {
        for (const uncertainty of output.uncertainties) {
          gaps.push({
            reportedBy: agentType,
            area: 'self_reported_uncertainty',
            description: `Agent ${agentType} reported uncertainty: ${uncertainty}`,
            dataNeeded: [this.extractDataNeedFromUncertainty(uncertainty)],
            impact: 'Medium: agent has identified its own knowledge gap which may affect decision quality',
          });
        }
      }
    }

    return gaps;
  }

  /**
   * Analyzes agent outputs for strategic blind spots.
   *
   * Checks whether each strategic dimension (defined in STRATEGIC_DIMENSIONS)
   * is adequately covered by the relevant agents' outputs. A dimension is
   * considered uncovered if none of the relevant agents mention its keywords
   * in their data or reasoning.
   *
   * @param outputs - Map of all agent outputs
   * @returns Array of strategy-related gaps
   */
  analyzeStrategyGaps(outputs: Map<AgentType, AgentOutput>): Gap[] {
    const gaps: Gap[] = [];

    for (const dimension of STRATEGIC_DIMENSIONS) {
      let dimensionCovered = false;
      const agentsPresent: AgentType[] = [];
      const agentsMissing: AgentType[] = [];

      for (const agentType of dimension.relevantAgents) {
        const output = outputs.get(agentType);
        if (!output) {
          agentsMissing.push(agentType);
          continue;
        }

        agentsPresent.push(agentType);

        // Check if this agent's output covers the strategic dimension
        const outputText = this.getSearchableText(output);
        const coversKeyword = dimension.keywords.some(
          (kw) => outputText.includes(kw.toLowerCase()),
        );

        if (coversKeyword) {
          dimensionCovered = true;
        }
      }

      if (!dimensionCovered) {
        const reportingAgent = agentsPresent.length > 0
          ? agentsPresent[0]
          : dimension.relevantAgents[0];

        gaps.push({
          reportedBy: reportingAgent,
          area: `strategy:${dimension.dimension}`,
          description: `Strategic dimension "${dimension.dimension}" is not covered: ${dimension.description}`,
          dataNeeded: dimension.keywords.map(
            (kw) => `Analysis addressing "${kw}" from ${dimension.relevantAgents.join(' or ')}`,
          ),
          impact: agentsMissing.length === dimension.relevantAgents.length
            ? 'High: none of the relevant agents produced output for this strategic dimension'
            : `Medium: ${agentsPresent.length}/${dimension.relevantAgents.length} relevant agents are present but none addresses this dimension`,
        });
      }
    }

    // Check for cross-agent coordination gaps
    const crossAgentGaps = this.detectCrossAgentCoordinationGaps(outputs);
    gaps.push(...crossAgentGaps);

    return gaps;
  }

  /**
   * Generates a structured gap report from a list of gaps.
   *
   * Categorizes gaps by severity (based on impact keywords), extracts
   * critical gaps, and produces actionable recommendations for addressing
   * the most important issues.
   *
   * @param gaps - Array of gaps to report on
   * @returns A GapReport with summary, critical gaps, and recommendations
   */
  generateGapReport(gaps: Gap[]): GapReport {
    logger.info('Generating gap report', { gapCount: gaps.length });

    const criticalGaps = gaps.filter((g) =>
      g.impact.toLowerCase().startsWith('high') ||
      g.area.startsWith('strategy:'),
    );

    const dataGaps = gaps.filter((g) => g.area === 'data_completeness');
    const strategyGaps = gaps.filter((g) => g.area.startsWith('strategy:'));
    const uncertaintyGaps = gaps.filter((g) => g.area === 'self_reported_uncertainty');
    const coordinationGaps = gaps.filter((g) => g.area === 'cross_agent_coordination');

    const summary = this.buildSummary(gaps, dataGaps, strategyGaps, uncertaintyGaps, coordinationGaps);
    const recommendations = this.buildRecommendations(gaps, criticalGaps);

    const report: GapReport = {
      summary,
      critical: criticalGaps,
      recommendations,
    };

    logger.info('Gap report generated', {
      criticalCount: criticalGaps.length,
      recommendationCount: recommendations.length,
    });

    return report;
  }

  /**
   * Persists a gap report to the database for tracking and follow-up.
   *
   * @param report - The gap report to persist
   */
  async persistGapReport(report: GapReport): Promise<void> {
    const id = generateId();

    try {
      await pool.query<GapReportRow>(
        `INSERT INTO gap_reports (id, summary, critical_gaps_json, recommendations_json, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          report.summary,
          JSON.stringify(report.critical),
          JSON.stringify(report.recommendations),
          new Date().toISOString(),
        ],
      );

      logger.info('Gap report persisted', { id, criticalGapCount: report.critical.length });
    } catch (err) {
      logger.error('Failed to persist gap report', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ---- Private Helper Methods ----

  /**
   * Detects gaps in cross-agent coordination by checking whether agents
   * that should be aware of each other's decisions are actually referencing
   * related data.
   */
  private detectCrossAgentCoordinationGaps(
    outputs: Map<AgentType, AgentOutput>,
  ): Gap[] {
    const gaps: Gap[] = [];

    // Budget agents should reference each other
    const budgetAgent = outputs.get('budget_optimization');
    const paidAdsAgent = outputs.get('paid_ads');
    if (budgetAgent && paidAdsAgent) {
      const budgetText = this.getSearchableText(budgetAgent);
      const paidText = this.getSearchableText(paidAdsAgent);

      if (!paidText.includes('budget') && !paidText.includes('allocation')) {
        gaps.push({
          reportedBy: 'paid_ads',
          area: 'cross_agent_coordination',
          description: 'Paid ads agent does not reference budget allocation from budget optimization',
          dataNeeded: ['budget_allocation', 'channel_budget_limits', 'spend_guardrails'],
          impact: 'Medium: paid ads decisions may not align with budget optimization constraints',
        });
      }

      if (!budgetText.includes('paid') && !budgetText.includes('ad_spend') && !budgetText.includes('adspend')) {
        gaps.push({
          reportedBy: 'budget_optimization',
          area: 'cross_agent_coordination',
          description: 'Budget optimization agent does not reference paid ads performance data',
          dataNeeded: ['ad_spend_performance', 'roas_by_channel', 'cpa_trends'],
          impact: 'Medium: budget allocation may not reflect actual paid ads efficiency',
        });
      }
    }

    // Analytics and forecasting should align
    const analyticsAgent = outputs.get('performance_analytics');
    const forecastAgent = outputs.get('revenue_forecasting');
    if (analyticsAgent && forecastAgent) {
      const forecastText = this.getSearchableText(forecastAgent);

      if (!forecastText.includes('actual') && !forecastText.includes('historical') && !forecastText.includes('analytics')) {
        gaps.push({
          reportedBy: 'revenue_forecasting',
          area: 'cross_agent_coordination',
          description: 'Revenue forecasting agent does not reference performance analytics data',
          dataNeeded: ['actual_revenue', 'historical_performance', 'trend_data'],
          impact: 'High: forecasts without grounding in actual performance data are unreliable',
        });
      }
    }

    // Compliance should be aware of all customer-facing agents
    const complianceAgent = outputs.get('compliance');
    if (complianceAgent) {
      const complianceText = this.getSearchableText(complianceAgent);
      const customerFacingAgents: AgentType[] = [
        'paid_ads', 'organic_social', 'content_blog', 'creative_generation',
      ];

      const unreferencedAgents = customerFacingAgents.filter((a) => {
        const shortName = a.replace(/_/g, '');
        return !complianceText.includes(shortName) && !complianceText.includes(a.replace(/_/g, ' '));
      });

      if (unreferencedAgents.length > 2) {
        gaps.push({
          reportedBy: 'compliance',
          area: 'cross_agent_coordination',
          description: `Compliance agent does not reference ${unreferencedAgents.length} customer-facing agents: ${unreferencedAgents.join(', ')}`,
          dataNeeded: unreferencedAgents.map((a) => `compliance_review_for_${a}`),
          impact: 'High: customer-facing content may not be reviewed for compliance',
        });
      }
    }

    return gaps;
  }

  /**
   * Creates a searchable text representation of an agent's output.
   * Combines decision, reasoning, data keys/values, recommendations, and warnings.
   */
  private getSearchableText(output: AgentOutput): string {
    const parts: string[] = [];

    if (output.decision) {
      parts.push(output.decision);
    }
    if (output.reasoning) {
      parts.push(output.reasoning);
    }
    if (output.data) {
      parts.push(JSON.stringify(output.data));
    }
    if (output.recommendations) {
      parts.push(output.recommendations.join(' '));
    }
    if (output.warnings) {
      parts.push(output.warnings.join(' '));
    }
    if (output.uncertainties) {
      parts.push(output.uncertainties.join(' '));
    }

    return parts.join(' ').toLowerCase();
  }

  /**
   * Extracts a value from a data object by key, with normalized key matching.
   */
  private extractValue(data: Record<string, unknown>, key: string): unknown {
    if (!data) {
      return undefined;
    }

    if (key in data) {
      return data[key];
    }

    const normalizedKey = key.toLowerCase().replace(/_/g, '');
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase().replace(/_/g, '') === normalizedKey) {
        return v;
      }
    }

    return undefined;
  }

  /**
   * Determines whether a value is "empty" (null, undefined, empty string,
   * empty array, or empty object).
   */
  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      return true;
    }
    if (Array.isArray(value) && value.length === 0) {
      return true;
    }
    if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
      return true;
    }
    return false;
  }

  /**
   * Attempts to extract a meaningful data need from an uncertainty description.
   * Falls back to a generic data request if no specific need can be identified.
   */
  private extractDataNeedFromUncertainty(uncertainty: string): string {
    const dataKeywords = [
      'data', 'metric', 'information', 'report', 'analysis',
      'benchmark', 'comparison', 'historical', 'trend',
    ];

    const lowerUncertainty = uncertainty.toLowerCase();

    for (const keyword of dataKeywords) {
      if (lowerUncertainty.includes(keyword)) {
        return `Additional ${keyword} to address: "${uncertainty.substring(0, 100)}"`;
      }
    }

    return `Data or analysis needed to resolve: "${uncertainty.substring(0, 100)}"`;
  }

  /**
   * Builds a human-readable summary of all gaps found.
   */
  private buildSummary(
    allGaps: Gap[],
    dataGaps: Gap[],
    strategyGaps: Gap[],
    uncertaintyGaps: Gap[],
    coordinationGaps: Gap[],
  ): string {
    const parts: string[] = [];

    parts.push(`Gap analysis identified ${allGaps.length} total gaps across the agent framework.`);

    if (dataGaps.length > 0) {
      parts.push(`${dataGaps.length} data completeness gaps: agents are missing expected data fields.`);
    }

    if (strategyGaps.length > 0) {
      parts.push(`${strategyGaps.length} strategic blind spots: key strategic dimensions are not addressed.`);
    }

    if (uncertaintyGaps.length > 0) {
      parts.push(`${uncertaintyGaps.length} self-reported uncertainties: agents have identified their own knowledge gaps.`);
    }

    if (coordinationGaps.length > 0) {
      parts.push(`${coordinationGaps.length} cross-agent coordination gaps: agents are not referencing each other's data.`);
    }

    const highImpact = allGaps.filter((g) => g.impact.toLowerCase().startsWith('high'));
    if (highImpact.length > 0) {
      parts.push(`${highImpact.length} gaps are classified as high impact and require immediate attention.`);
    }

    return parts.join(' ');
  }

  /**
   * Builds actionable recommendations based on the gaps found.
   */
  private buildRecommendations(allGaps: Gap[], criticalGaps: Gap[]): string[] {
    const recommendations: string[] = [];

    // Group gaps by area
    const areaGroups = new Map<string, Gap[]>();
    for (const gap of allGaps) {
      const existing = areaGroups.get(gap.area) || [];
      existing.push(gap);
      areaGroups.set(gap.area, existing);
    }

    // Recommend addressing data completeness first
    const dataGaps = areaGroups.get('data_completeness');
    if (dataGaps && dataGaps.length > 0) {
      const agentsWithGaps = [...new Set(dataGaps.map((g) => g.reportedBy))];
      recommendations.push(
        `Improve data pipelines for ${agentsWithGaps.length} agents with data gaps: ${agentsWithGaps.join(', ')}. Ensure all expected data fields are populated before the next decision cycle.`,
      );
    }

    // Recommend strategy coverage improvements
    const strategyAreas = Array.from(areaGroups.keys()).filter((k) => k.startsWith('strategy:'));
    if (strategyAreas.length > 0) {
      const dimensions = strategyAreas.map((a) => a.replace('strategy:', ''));
      recommendations.push(
        `Address ${strategyAreas.length} strategic blind spots: ${dimensions.join(', ')}. Ensure at least one relevant agent explicitly covers each dimension in its analysis.`,
      );
    }

    // Recommend cross-agent coordination improvements
    const coordGaps = areaGroups.get('cross_agent_coordination');
    if (coordGaps && coordGaps.length > 0) {
      recommendations.push(
        `Improve cross-agent data sharing: ${coordGaps.length} coordination gaps detected. Configure agent inputs to include relevant outputs from upstream agents.`,
      );
    }

    // Critical gap specific recommendations
    if (criticalGaps.length > 0) {
      const uniqueAgents = [...new Set(criticalGaps.map((g) => g.reportedBy))];
      recommendations.push(
        `Priority action: ${criticalGaps.length} critical gaps affecting agents: ${uniqueAgents.join(', ')}. These should be resolved before executing any agent decisions.`,
      );
    }

    // Generic recommendations based on gap count
    if (allGaps.length > 10) {
      recommendations.push(
        'Consider a comprehensive review of data integration and agent configuration. The high number of gaps suggests systemic issues with data flow between agents.',
      );
    }

    if (allGaps.length === 0) {
      recommendations.push(
        'No gaps detected. Agent outputs have good data coverage and strategic alignment. Continue monitoring in subsequent challenge cycles.',
      );
    }

    return recommendations;
  }
}
