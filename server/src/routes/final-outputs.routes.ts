/**
 * Final Outputs Route Aggregator.
 *
 * Phase 10 unified router for ALL 10 final output deliverables. This file is
 * self-contained -- it imports services directly rather than delegating to
 * individual controller files -- to minimise merge conflicts across agents.
 *
 * Deliverables:
 *  1. Country Ranking & Opportunity Table
 *  2. Country Marketing Strategies
 *  3. Channel Allocation
 *  4. Budget Model
 *  5. Risk Assessment
 *  6. ROI Projection
 *  7. Execution Roadmap
 *  8. Confidence Score
 *  9. Weakness Report
 * 10. Perfection Recommendations + Validation Summary
 *
 * All routes are mounted under the `/final-outputs` prefix via app.ts.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { pool } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { logger } from '../utils/logger';
import roiProjectionRoutes from './final-outputs-roi.routes';
import perfectionRoutes from './final-outputs-perfection.routes';
import riskAssessmentRoutes from './final-outputs-risk.routes';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// Apply authentication to all final-outputs routes
router.use(authenticate);

// Mount dedicated ROI Projection routes (Deliverable #6)
router.use('/', roiProjectionRoutes);

// Mount dedicated Perfection Recommendations routes (Deliverable #10)
router.use('/', perfectionRoutes);

// Mount dedicated Risk Assessment routes (Deliverable #5 - RiskAssessmentOutputService)
router.use('/', riskAssessmentRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap an async handler so thrown errors are forwarded to Express.
 */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: import('express').NextFunction) => {
    fn(req, res).catch(next);
  };
}

/**
 * Standard success envelope.
 */
function ok(res: Response, data: unknown, meta?: Record<string, unknown>) {
  res.json({ success: true, data, ...meta });
}

/**
 * Fetch rows from the database with optional Redis caching.
 */
async function cachedQuery<T>(
  cacheKey: string,
  ttl: number,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const cached = await cacheGet<T[]>(cacheKey);
  if (cached) return cached;

  const result = await pool.query(sql, params);
  const rows = result.rows as T[];
  await cacheSet(cacheKey, rows, ttl).catch((err) =>
    logger.warn('Cache set failed', { key: cacheKey, error: String(err) }),
  );
  return rows;
}

// ---------------------------------------------------------------------------
// 1. Country Ranking & Opportunity Table
// ---------------------------------------------------------------------------

router.get(
  '/country-ranking',
  asyncHandler(async (_req: Request, res: Response) => {
    const cacheKey = 'final-outputs:country-ranking';
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return ok(res, cached);

    const rows = await pool.query(`
      SELECT c.code AS country_code, c.name AS country_name,
             c.gdp, c.internet_penetration, c.ecommerce_adoption,
             COALESCE(c.opportunity_score, 0) AS opportunity_score
      FROM countries c
      ORDER BY opportunity_score DESC
    `);

    const rankings = rows.rows.map((row: Record<string, unknown>, idx: number) => ({
      rank: idx + 1,
      ...row,
    }));

    const data = {
      rankings,
      generated_at: new Date().toISOString(),
      total_countries: rankings.length,
    };

    await cacheSet(cacheKey, data, 300).catch(() => {});
    ok(res, data);
  }),
);

router.get(
  '/country-ranking/methodology',
  asyncHandler(async (_req: Request, res: Response) => {
    const methodology = {
      name: 'Weighted Multi-Factor Opportunity Scoring',
      version: '1.0',
      factors: [
        { name: 'GDP', weight: 0.2, description: 'Gross domestic product as proxy for market size' },
        { name: 'Internet Penetration', weight: 0.2, description: 'Percentage of population with internet access' },
        { name: 'E-commerce Adoption', weight: 0.2, description: 'Percentage of internet users buying online' },
        { name: 'Social Media Usage', weight: 0.15, description: 'Average platform penetration rate' },
        { name: 'Ad Cost Efficiency', weight: 0.1, description: 'Inverse of average CPC relative to GDP per capita' },
        { name: 'Regulatory Environment', weight: 0.15, description: 'Ease of doing digital marketing business' },
      ],
      score_range: { min: 0, max: 100 },
      updated_at: new Date().toISOString(),
    };
    ok(res, methodology);
  }),
);

// ---------------------------------------------------------------------------
// 2. Country Marketing Strategies
// ---------------------------------------------------------------------------

router.get(
  '/strategies',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await cachedQuery<Record<string, unknown>>(
      'final-outputs:strategies',
      300,
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'country_strategy'
       ORDER BY ad.confidence_score DESC`,
    );

    const strategies = rows.map((r) => ({
      country_code: r.country_code,
      country_name: r.country_name,
      strategy: r.decision_data,
      confidence: r.confidence_score,
      generated_at: r.created_at,
    }));

    ok(res, strategies, { total: strategies.length });
  }),
);

router.get(
  '/strategies/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT COUNT(DISTINCT country_code) AS countries_covered,
             AVG(confidence_score) AS avg_confidence,
             MIN(created_at) AS earliest,
             MAX(created_at) AS latest
      FROM agent_decisions
      WHERE agent_type = 'country_strategy'
    `);

    const row = result.rows[0] || {};
    ok(res, {
      countries_covered: Number(row.countries_covered) || 0,
      average_confidence: Number(Number(row.avg_confidence || 0).toFixed(2)),
      date_range: {
        earliest: row.earliest || null,
        latest: row.latest || null,
      },
    });
  }),
);

router.get(
  '/strategies/:countryCode',
  asyncHandler(async (req: Request, res: Response) => {
    const { countryCode } = req.params;
    const result = await pool.query(
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'country_strategy'
         AND ad.country_code = $1
       ORDER BY ad.created_at DESC
       LIMIT 1`,
      [countryCode.toUpperCase()],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No strategy found for country: ${countryCode}` },
      });
      return;
    }

    const row = result.rows[0];
    ok(res, {
      country_code: row.country_code,
      country_name: row.country_name,
      strategy: row.decision_data,
      confidence: row.confidence_score,
      generated_at: row.created_at,
    });
  }),
);

// ---------------------------------------------------------------------------
// 3. Channel Allocation
// ---------------------------------------------------------------------------

router.get(
  '/channel-allocation',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await cachedQuery<Record<string, unknown>>(
      'final-outputs:channel-allocation',
      300,
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'channel_allocation'
       ORDER BY c.name ASC`,
    );

    ok(res, rows.map((r) => ({
      country_code: r.country_code,
      country_name: r.country_name,
      allocation: r.decision_data,
      confidence: r.confidence_score,
      generated_at: r.created_at,
    })));
  }),
);

router.get(
  '/channel-allocation/history',
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 30;
    const rows = await pool.query(
      `SELECT ad.country_code, ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       WHERE ad.agent_type = 'channel_allocation'
         AND ad.created_at >= NOW() - INTERVAL '1 day' * $1
       ORDER BY ad.created_at DESC`,
      [days],
    );

    ok(res, rows.rows, { period_days: days, total: rows.rows.length });
  }),
);

router.get(
  '/channel-allocation/:countryCode',
  asyncHandler(async (req: Request, res: Response) => {
    const { countryCode } = req.params;
    const result = await pool.query(
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'channel_allocation'
         AND ad.country_code = $1
       ORDER BY ad.created_at DESC
       LIMIT 1`,
      [countryCode.toUpperCase()],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No channel allocation found for country: ${countryCode}` },
      });
      return;
    }

    const row = result.rows[0];
    ok(res, {
      country_code: row.country_code,
      country_name: row.country_name,
      allocation: row.decision_data,
      confidence: row.confidence_score,
      generated_at: row.created_at,
    });
  }),
);

// ---------------------------------------------------------------------------
// 4. Budget Model
// ---------------------------------------------------------------------------

router.get(
  '/budget-model',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await cachedQuery<Record<string, unknown>>(
      'final-outputs:budget-model',
      300,
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'budget_model'
       ORDER BY ad.confidence_score DESC`,
    );

    ok(res, rows.map((r) => ({
      country_code: r.country_code,
      country_name: r.country_name,
      budget: r.decision_data,
      confidence: r.confidence_score,
      generated_at: r.created_at,
    })));
  }),
);

router.get(
  '/budget-model/velocity',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT DATE_TRUNC('day', created_at) AS day,
             COUNT(*) AS models_generated,
             AVG(confidence_score) AS avg_confidence
      FROM agent_decisions
      WHERE agent_type = 'budget_model'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `);

    ok(res, {
      velocity: result.rows,
      period_days: 30,
      total_models: result.rows.reduce(
        (sum: number, r: Record<string, unknown>) => sum + Number(r.models_generated),
        0,
      ),
    });
  }),
);

router.get(
  '/budget-model/utilization',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT ad.country_code, c.name AS country_name,
             ad.decision_data, ad.confidence_score
      FROM agent_decisions ad
      JOIN countries c ON c.code = ad.country_code
      WHERE ad.agent_type = 'budget_model'
        AND ad.created_at = (
          SELECT MAX(created_at) FROM agent_decisions ad2
          WHERE ad2.country_code = ad.country_code
            AND ad2.agent_type = 'budget_model'
        )
      ORDER BY ad.confidence_score DESC
    `);

    const totalCountries = await pool.query('SELECT COUNT(*) AS cnt FROM countries');
    const covered = result.rows.length;
    const total = Number(totalCountries.rows[0]?.cnt) || 0;

    ok(res, {
      utilization_rate: total > 0 ? Number((covered / total * 100).toFixed(1)) : 0,
      countries_with_budget: covered,
      total_countries: total,
      models: result.rows.map((r: Record<string, unknown>) => ({
        country_code: r.country_code,
        country_name: r.country_name,
        budget: r.decision_data,
        confidence: r.confidence_score,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// 5. Risk Assessment (served by dedicated routes file)
// ---------------------------------------------------------------------------
// Routes for /risk-assessment, /risk-assessment/mitigation-plan,
// and /risk-assessment/:category are mounted via
// final-outputs-risk.routes.ts above.

// ---------------------------------------------------------------------------
// 6. ROI Projection
// ---------------------------------------------------------------------------

router.get(
  '/roi-projection',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await cachedQuery<Record<string, unknown>>(
      'final-outputs:roi-projection',
      300,
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'roi_projection'
       ORDER BY ad.confidence_score DESC`,
    );

    ok(res, rows.map((r) => ({
      country_code: r.country_code,
      country_name: r.country_name,
      projection: r.decision_data,
      confidence: r.confidence_score,
      projected_at: r.created_at,
    })));
  }),
);

router.get(
  '/roi-projection/trend',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT DATE_TRUNC('week', created_at) AS week,
             AVG(confidence_score) AS avg_confidence,
             COUNT(*) AS projections_count
      FROM agent_decisions
      WHERE agent_type = 'roi_projection'
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
    `);

    ok(res, { trend: result.rows, period_days: 90 });
  }),
);

router.get(
  '/roi-projection/:countryCode',
  asyncHandler(async (req: Request, res: Response) => {
    const { countryCode } = req.params;
    const result = await pool.query(
      `SELECT ad.country_code, c.name AS country_name,
              ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       JOIN countries c ON c.code = ad.country_code
       WHERE ad.agent_type = 'roi_projection'
         AND ad.country_code = $1
       ORDER BY ad.created_at DESC
       LIMIT 1`,
      [countryCode.toUpperCase()],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No ROI projection found for country: ${countryCode}` },
      });
      return;
    }

    const row = result.rows[0];
    ok(res, {
      country_code: row.country_code,
      country_name: row.country_name,
      projection: row.decision_data,
      confidence: row.confidence_score,
      projected_at: row.created_at,
    });
  }),
);

// ---------------------------------------------------------------------------
// 7. Execution Roadmap
// ---------------------------------------------------------------------------

router.get(
  '/execution-roadmap',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await cachedQuery<Record<string, unknown>>(
      'final-outputs:execution-roadmap',
      300,
      `SELECT ad.decision_data, ad.confidence_score, ad.created_at
       FROM agent_decisions ad
       WHERE ad.agent_type = 'execution_roadmap'
       ORDER BY ad.created_at DESC
       LIMIT 1`,
    );

    if (rows.length === 0) {
      ok(res, { phases: [], generated_at: null });
      return;
    }

    const row = rows[0];
    ok(res, {
      roadmap: row.decision_data,
      confidence: row.confidence_score,
      generated_at: row.created_at,
    });
  }),
);

router.get(
  '/execution-roadmap/milestones',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT ad.decision_data, ad.confidence_score, ad.created_at
      FROM agent_decisions ad
      WHERE ad.agent_type = 'execution_roadmap'
      ORDER BY ad.created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      ok(res, { milestones: [] });
      return;
    }

    const data = result.rows[0].decision_data as Record<string, unknown> | null;
    const milestones = data?.milestones || data?.key_milestones || [];

    ok(res, { milestones, generated_at: result.rows[0].created_at });
  }),
);

router.get(
  '/execution-roadmap/:phase',
  asyncHandler(async (req: Request, res: Response) => {
    const phaseParam = req.params.phase;
    const result = await pool.query(`
      SELECT ad.decision_data, ad.confidence_score, ad.created_at
      FROM agent_decisions ad
      WHERE ad.agent_type = 'execution_roadmap'
      ORDER BY ad.created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No execution roadmap available' },
      });
      return;
    }

    const data = result.rows[0].decision_data as Record<string, unknown> | null;
    const phases = (data?.phases || []) as Record<string, unknown>[];
    const phase = phases.find(
      (p) =>
        String(p.phase_number || p.id || '') === phaseParam ||
        String(p.name || '').toLowerCase() === phaseParam.toLowerCase(),
    );

    if (!phase) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Phase not found: ${phaseParam}` },
      });
      return;
    }

    ok(res, { phase, generated_at: result.rows[0].created_at });
  }),
);

// ---------------------------------------------------------------------------
// 8. Confidence Score
// ---------------------------------------------------------------------------

router.get(
  '/confidence-score',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT agent_type,
             AVG(confidence_score) AS avg_confidence,
             MIN(confidence_score) AS min_confidence,
             MAX(confidence_score) AS max_confidence,
             COUNT(*) AS decision_count
      FROM agent_decisions
      GROUP BY agent_type
      ORDER BY avg_confidence DESC
    `);

    const overall = await pool.query(`
      SELECT AVG(confidence_score) AS overall_avg,
             COUNT(*) AS total_decisions
      FROM agent_decisions
    `);

    ok(res, {
      by_agent: result.rows,
      overall: {
        average_confidence: Number(Number(overall.rows[0]?.overall_avg || 0).toFixed(2)),
        total_decisions: Number(overall.rows[0]?.total_decisions) || 0,
      },
    });
  }),
);

router.get(
  '/confidence-score/trend',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT DATE_TRUNC('day', created_at) AS day,
             AVG(confidence_score) AS avg_confidence,
             COUNT(*) AS decisions
      FROM agent_decisions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `);

    ok(res, { trend: result.rows, period_days: 30 });
  }),
);

router.get(
  '/confidence-score/:agentId',
  asyncHandler(async (req: Request, res: Response) => {
    const { agentId } = req.params;
    const result = await pool.query(
      `SELECT agent_type, confidence_score, country_code, created_at
       FROM agent_decisions
       WHERE agent_type = $1
       ORDER BY created_at DESC`,
      [agentId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No decisions found for agent: ${agentId}` },
      });
      return;
    }

    const scores = result.rows;
    const avg =
      scores.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.confidence_score), 0) /
      scores.length;

    ok(res, {
      agent_id: agentId,
      average_confidence: Number(avg.toFixed(2)),
      total_decisions: scores.length,
      decisions: scores,
    });
  }),
);

// ---------------------------------------------------------------------------
// 9. Weakness Report
// ---------------------------------------------------------------------------

router.get(
  '/weakness-report',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT agent_type, country_code, confidence_score,
             decision_data, created_at
      FROM agent_decisions
      WHERE confidence_score < 70
      ORDER BY confidence_score ASC
    `);

    const weaknesses = result.rows.map((r: Record<string, unknown>) => ({
      agent_type: r.agent_type,
      country_code: r.country_code,
      confidence_score: r.confidence_score,
      weakness_indicators: extractWeaknesses(r.decision_data as Record<string, unknown> | null),
      created_at: r.created_at,
    }));

    ok(res, {
      weaknesses,
      total: weaknesses.length,
      threshold: 70,
    });
  }),
);

router.get(
  '/weakness-report/priorities',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT agent_type,
             COUNT(*) AS weakness_count,
             AVG(confidence_score) AS avg_confidence,
             MIN(confidence_score) AS min_confidence
      FROM agent_decisions
      WHERE confidence_score < 70
      GROUP BY agent_type
      ORDER BY weakness_count DESC, avg_confidence ASC
    `);

    ok(res, {
      priorities: result.rows.map((r: Record<string, unknown>, idx: number) => ({
        priority: idx + 1,
        agent_type: r.agent_type,
        weakness_count: Number(r.weakness_count),
        avg_confidence: Number(Number(r.avg_confidence || 0).toFixed(2)),
        min_confidence: Number(r.min_confidence),
      })),
      total_weak_decisions: result.rows.reduce(
        (sum: number, r: Record<string, unknown>) => sum + Number(r.weakness_count),
        0,
      ),
    });
  }),
);

router.get(
  '/weakness-report/:category',
  asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.params;
    const validCategories = [
      'data_quality', 'coverage', 'confidence', 'timeliness',
      'consistency', 'completeness',
    ];

    if (!validCategories.includes(category.toLowerCase())) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORY',
          message: `Invalid weakness category. Valid categories: ${validCategories.join(', ')}`,
        },
      });
      return;
    }

    const result = await pool.query(`
      SELECT agent_type, country_code, confidence_score,
             decision_data, created_at
      FROM agent_decisions
      WHERE confidence_score < 70
      ORDER BY confidence_score ASC
    `);

    const filtered = result.rows
      .map((r: Record<string, unknown>) => {
        const indicators = extractWeaknesses(r.decision_data as Record<string, unknown> | null);
        const categoryIndicators = indicators.filter(
          (i) => i.category.toLowerCase() === category.toLowerCase(),
        );
        return {
          agent_type: r.agent_type,
          country_code: r.country_code,
          confidence_score: r.confidence_score,
          weaknesses: categoryIndicators,
          created_at: r.created_at,
        };
      })
      .filter((entry) => entry.weaknesses.length > 0);

    ok(res, filtered, { category, total: filtered.length });
  }),
);

// ---------------------------------------------------------------------------
// 10. Perfection Recommendations (served by dedicated routes file)
// ---------------------------------------------------------------------------
// Routes for /perfection-recommendations, /perfection-recommendations/maturity,
// and /perfection-recommendations/:category are mounted via
// final-outputs-perfection.routes.ts above.

// ---------------------------------------------------------------------------
// Validation Summary (cross-deliverable)
// ---------------------------------------------------------------------------

router.get(
  '/validation-summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const agentTypes = [
      'country_strategy',
      'channel_allocation',
      'budget_model',
      'risk_assessment',
      'roi_projection',
      'execution_roadmap',
    ];

    const result = await pool.query(`
      SELECT agent_type,
             COUNT(*) AS total_decisions,
             COUNT(DISTINCT country_code) AS countries_covered,
             AVG(confidence_score) AS avg_confidence,
             MAX(created_at) AS last_updated
      FROM agent_decisions
      GROUP BY agent_type
    `);

    const countryResult = await pool.query('SELECT COUNT(*) AS cnt FROM countries');
    const totalCountries = Number(countryResult.rows[0]?.cnt) || 0;

    const deliverables = agentTypes.map((agentType) => {
      const row = result.rows.find(
        (r: Record<string, unknown>) => r.agent_type === agentType,
      );
      const covered = Number(row?.countries_covered) || 0;
      const avgConf = Number(row?.avg_confidence || 0);

      return {
        deliverable: agentType,
        status: row ? (avgConf >= 70 ? 'complete' : 'needs_improvement') : 'missing',
        total_decisions: Number(row?.total_decisions) || 0,
        countries_covered: covered,
        coverage_pct: totalCountries > 0 ? Number((covered / totalCountries * 100).toFixed(1)) : 0,
        avg_confidence: Number(avgConf.toFixed(2)),
        last_updated: row?.last_updated || null,
      };
    });

    const completeCount = deliverables.filter((d) => d.status === 'complete').length;
    const overallConfidence =
      deliverables.reduce((s, d) => s + d.avg_confidence, 0) / (deliverables.length || 1);

    ok(res, {
      summary: {
        total_deliverables: agentTypes.length,
        complete: completeCount,
        needs_improvement: deliverables.filter((d) => d.status === 'needs_improvement').length,
        missing: deliverables.filter((d) => d.status === 'missing').length,
        overall_confidence: Number(overallConfidence.toFixed(2)),
        total_countries: totalCountries,
        validation_timestamp: new Date().toISOString(),
      },
      deliverables,
    });
  }),
);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

interface WeaknessIndicator {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

function extractWeaknesses(
  data: Record<string, unknown> | null,
): WeaknessIndicator[] {
  if (!data) {
    return [{ category: 'data_quality', description: 'No decision data available', severity: 'high' }];
  }

  const indicators: WeaknessIndicator[] = [];

  // Check for missing or empty fields
  const expectedFields = ['risks', 'recommendations', 'strategy', 'allocation'];
  for (const field of expectedFields) {
    const value = data[field];
    if (value === null || value === undefined) {
      indicators.push({
        category: 'completeness',
        description: `Missing field: ${field}`,
        severity: 'medium',
      });
    } else if (Array.isArray(value) && value.length === 0) {
      indicators.push({
        category: 'coverage',
        description: `Empty array: ${field}`,
        severity: 'low',
      });
    }
  }

  // Check for low confidence indicators in nested data
  if (data.confidence_factors && typeof data.confidence_factors === 'object') {
    const factors = data.confidence_factors as Record<string, number>;
    for (const [key, val] of Object.entries(factors)) {
      if (typeof val === 'number' && val < 50) {
        indicators.push({
          category: 'confidence',
          description: `Low confidence factor: ${key} (${val})`,
          severity: 'high',
        });
      }
    }
  }

  if (indicators.length === 0) {
    indicators.push({
      category: 'data_quality',
      description: 'General low confidence without specific indicators',
      severity: 'medium',
    });
  }

  return indicators;
}

function generateRecommendation(
  agentType: string,
  avgConfidence: number,
  lowConfidenceCount: number,
): string {
  if (avgConfidence >= 90) {
    return `${agentType} is performing excellently. Continue monitoring for consistency.`;
  }
  if (avgConfidence >= 75) {
    if (lowConfidenceCount > 0) {
      return `${agentType} is performing well overall but has ${lowConfidenceCount} low-confidence decision(s). Review input data quality for those cases.`;
    }
    return `${agentType} is performing well. Minor tuning of model parameters could push confidence above 90%.`;
  }
  if (avgConfidence >= 60) {
    return `${agentType} needs improvement. Consider enriching input data sources and reviewing agent prompt engineering.`;
  }
  return `${agentType} requires significant attention. Recommend retraining with expanded datasets and revisiting the decision framework.`;
}

function generateCategoryRecommendations(category: string): Record<string, unknown>[] {
  const recommendations: Record<string, Record<string, unknown>[]> = {
    data_enrichment: [
      { action: 'Add alternative data sources for market sizing', priority: 'high', effort: 'medium' },
      { action: 'Integrate real-time exchange rate data', priority: 'medium', effort: 'low' },
      { action: 'Include social media trend data from local platforms', priority: 'high', effort: 'high' },
    ],
    model_tuning: [
      { action: 'Adjust confidence scoring weights based on validation results', priority: 'high', effort: 'medium' },
      { action: 'Implement ensemble scoring for risk assessment', priority: 'medium', effort: 'high' },
      { action: 'Add feedback loops from historical campaign performance', priority: 'high', effort: 'high' },
    ],
    coverage_expansion: [
      { action: 'Extend country coverage to emerging markets in Africa', priority: 'medium', effort: 'medium' },
      { action: 'Add Southeast Asian markets not yet covered', priority: 'high', effort: 'medium' },
      { action: 'Include micro-market analysis for top-5 countries', priority: 'low', effort: 'high' },
    ],
    confidence_improvement: [
      { action: 'Increase training data volume for low-confidence agents', priority: 'high', effort: 'high' },
      { action: 'Implement cross-validation between agent outputs', priority: 'high', effort: 'medium' },
      { action: 'Add manual review workflow for decisions below 60% confidence', priority: 'medium', effort: 'low' },
    ],
    process_optimization: [
      { action: 'Automate data refresh pipeline to run daily', priority: 'high', effort: 'medium' },
      { action: 'Implement caching for frequently accessed deliverables', priority: 'medium', effort: 'low' },
      { action: 'Set up alerting for confidence score degradation', priority: 'high', effort: 'low' },
    ],
  };

  return recommendations[category] || [];
}

export default router;
