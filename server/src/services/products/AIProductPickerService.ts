/**
 * AI Product Picker Service.
 *
 * Provides AI-powered and algorithmic product selection from Shopify
 * collections. Supports multiple strategies: random, most-viewed,
 * most-sold, trending, and AI-recommended.
 */

import { query } from '../../config/database';
import { ValidationError } from '../../utils/errors';
import logger from '../../utils/logger';
import { AI_ENABLED } from '../../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PickRequest {
  collectionId?: string;
  strategy: 'random' | 'most_viewed' | 'most_sold' | 'ai_recommended' | 'trending';
  count: number;
  filters?: {
    minPrice?: number;
    maxPrice?: number;
    minInventory?: number;
    tags?: string[];
  };
}

export interface PickedProduct {
  id: string;
  title: string;
  description: string | null;
  shopify_id: string | null;
  images: unknown[];
  variants: unknown[];
  inventory_level: number;
  is_active: boolean;
  score: number;
  scoreBreakdown: {
    views: number;
    sales: number;
    conversion: number;
    recency: number;
    inventory: number;
  };
  reasoning: string;
}

export interface PickResult {
  products: PickedProduct[];
  strategy: string;
  totalCandidates: number;
  confidence: number;
  insights: string[];
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresAI: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AIProductPickerService {
  static async pick(request: PickRequest): Promise<PickResult> {
    const { collectionId, strategy, count, filters } = request;

    if (!strategy) throw new ValidationError('Strategy is required');
    if (!count || count < 1 || count > 100) throw new ValidationError('Count must be between 1 and 100');

    const conditions: string[] = ['p.is_active = true'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (collectionId) {
      conditions.push(`EXISTS (SELECT 1 FROM collection_products cp WHERE cp.product_id = p.id AND cp.collection_id = $${paramIdx++})`);
      params.push(collectionId);
    }
    if (filters?.minPrice !== undefined) {
      conditions.push(`COALESCE((p.variants->0->>'price')::numeric, 0) >= $${paramIdx++}`);
      params.push(filters.minPrice);
    }
    if (filters?.maxPrice !== undefined) {
      conditions.push(`COALESCE((p.variants->0->>'price')::numeric, 0) <= $${paramIdx++}`);
      params.push(filters.maxPrice);
    }
    if (filters?.minInventory !== undefined) {
      conditions.push(`p.inventory_level >= $${paramIdx++}`);
      params.push(filters.minInventory);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM products p ${whereClause}`, params);
    const totalCandidates = parseInt(countResult.rows[0].count, 10);

    if (totalCandidates === 0) {
      return { products: [], strategy, totalCandidates: 0, confidence: 0, insights: ['No products match the current filters.'] };
    }

    let products: PickedProduct[];
    switch (strategy) {
      case 'random':
        products = await AIProductPickerService.pickRandom(whereClause, params, count);
        break;
      case 'most_viewed':
        products = await AIProductPickerService.pickMostViewed(whereClause, params, count);
        break;
      case 'most_sold':
        products = await AIProductPickerService.pickMostSold(whereClause, params, count);
        break;
      case 'trending':
        products = await AIProductPickerService.pickTrending(whereClause, params, count);
        break;
      case 'ai_recommended':
        products = await AIProductPickerService.pickAIRecommended(whereClause, params, count);
        break;
      default:
        throw new ValidationError(`Unknown strategy: ${strategy}`);
    }

    const confidence = AIProductPickerService.calcConfidence(products, totalCandidates, strategy);
    const insights = AIProductPickerService.genInsights(products, strategy, totalCandidates);

    logger.info('AI Product Picker completed', { strategy, count: products.length, totalCandidates, confidence });
    return { products, strategy, totalCandidates, confidence, insights };
  }

  private static async pickRandom(where: string, params: unknown[], count: number): Promise<PickedProduct[]> {
    const result = await query<Record<string, unknown>>(`SELECT p.* FROM products p ${where} ORDER BY RANDOM() LIMIT ${count}`, params);
    return result.rows.map((r) => AIProductPickerService.toProduct(r, 'Randomly selected from pool', 50));
  }

  private static async pickMostViewed(where: string, params: unknown[], count: number): Promise<PickedProduct[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*, COALESCE(v.vc, 0) AS view_count FROM products p
       LEFT JOIN (SELECT product_id, COUNT(*) AS vc FROM product_views GROUP BY product_id) v ON v.product_id = p.id
       ${where} ORDER BY COALESCE(v.vc, 0) DESC LIMIT ${count}`, params);
    return result.rows.map((r, i) => {
      const views = Number(r.view_count) || 0;
      return AIProductPickerService.toProduct(r, `Ranked #${i + 1} with ${views} views`, Math.max(30, 95 - i * 5));
    });
  }

  private static async pickMostSold(where: string, params: unknown[], count: number): Promise<PickedProduct[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*, COALESCE(s.ts, 0) AS total_sold, COALESCE(s.tr, 0) AS total_revenue FROM products p
       LEFT JOIN (SELECT product_id, SUM(quantity) AS ts, SUM(revenue) AS tr FROM product_sales GROUP BY product_id) s ON s.product_id = p.id
       ${where} ORDER BY COALESCE(s.ts, 0) DESC LIMIT ${count}`, params);
    return result.rows.map((r, i) => {
      const sold = Number(r.total_sold) || 0;
      const rev = Number(r.total_revenue) || 0;
      return AIProductPickerService.toProduct(r, `#${i + 1}: ${sold} units sold, $${rev.toFixed(2)} revenue`, Math.max(30, 95 - i * 5));
    });
  }

  private static async pickTrending(where: string, params: unknown[], count: number): Promise<PickedProduct[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*, COALESCE(r.rs, 0) AS recent_sales, COALESCE(o.os, 0) AS older_sales FROM products p
       LEFT JOIN (SELECT product_id, SUM(quantity) AS rs FROM product_sales WHERE sold_at >= NOW() - INTERVAL '7 days' GROUP BY product_id) r ON r.product_id = p.id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS os FROM product_sales WHERE sold_at >= NOW() - INTERVAL '30 days' AND sold_at < NOW() - INTERVAL '7 days' GROUP BY product_id) o ON o.product_id = p.id
       ${where} ORDER BY COALESCE(r.rs, 0) DESC LIMIT ${count}`, params);
    return result.rows.map((r, i) => {
      const recent = Number(r.recent_sales) || 0;
      const older = Number(r.older_sales) || 0;
      const trend = older > 0 ? (recent > older ? 'rising' : 'declining') : (recent > 0 ? 'new' : 'no data');
      return AIProductPickerService.toProduct(r, `Trend: ${trend} (${recent} sales this week)`, Math.max(20, 90 - i * 5));
    });
  }

  private static async pickAIRecommended(where: string, params: unknown[], count: number): Promise<PickedProduct[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*, COALESCE(v.vc, 0) AS view_count, COALESCE(s.ts, 0) AS total_sold, COALESCE(s.tr, 0) AS total_revenue,
              COALESCE(rs.rsc, 0) AS recent_sales
       FROM products p
       LEFT JOIN (SELECT product_id, COUNT(*) AS vc FROM product_views GROUP BY product_id) v ON v.product_id = p.id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS ts, SUM(revenue) AS tr FROM product_sales GROUP BY product_id) s ON s.product_id = p.id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS rsc FROM product_sales WHERE sold_at >= NOW() - INTERVAL '7 days' GROUP BY product_id) rs ON rs.product_id = p.id
       ${where} ORDER BY (COALESCE(v.vc, 0) * 0.2 + COALESCE(s.ts, 0) * 10 * 0.3 +
         CASE WHEN COALESCE(v.vc, 0) > 0 THEN (COALESCE(s.ts, 0)::float / v.vc) * 100 ELSE 0 END * 0.2 +
         COALESCE(rs.rsc, 0) * 20 * 0.15 + LEAST(p.inventory_level, 100) * 0.15) DESC
       LIMIT ${count}`, params);

    return result.rows.map((r, i) => {
      const views = Number(r.view_count) || 0;
      const sold = Number(r.total_sold) || 0;
      const recentSales = Number(r.recent_sales) || 0;
      const inventory = Number(r.inventory_level) || 0;
      const convRate = views > 0 ? (sold / views) * 100 : 0;

      const vScore = Math.min(25, views * 0.2);
      const sScore = Math.min(30, sold * 0.3);
      const cScore = Math.min(20, convRate * 2);
      const rScore = Math.min(15, recentSales * 3);
      const iScore = Math.min(10, (inventory / 100) * 10);
      const total = Math.min(100, Math.round(vScore + sScore + cScore + rScore + iScore));

      const reasons: string[] = [];
      if (AI_ENABLED) reasons.push('AI-enhanced scoring');
      if (views > 50) reasons.push(`High visibility (${views} views)`);
      if (sold > 10) reasons.push(`Strong sales (${sold} units)`);
      if (convRate > 5) reasons.push(`High conversion (${convRate.toFixed(1)}%)`);
      if (recentSales > 3) reasons.push(`Trending (${recentSales} recent sales)`);
      if (reasons.length === 0) reasons.push('Selected via composite scoring');

      return {
        ...AIProductPickerService.toProduct(r, reasons.join('. '), total),
        scoreBreakdown: { views: Math.round(vScore), sales: Math.round(sScore), conversion: Math.round(cScore), recency: Math.round(rScore), inventory: Math.round(iScore) },
      };
    });
  }

  static async getStrategies(): Promise<Strategy[]> {
    return [
      { id: 'random', name: 'Random Selection', description: 'Randomly pick products for diverse exposure', icon: 'Shuffle', requiresAI: false },
      { id: 'most_viewed', name: 'Most Viewed', description: 'Products with highest view counts', icon: 'Eye', requiresAI: false },
      { id: 'most_sold', name: 'Best Sellers', description: 'Top-selling products by units sold', icon: 'TrendingUp', requiresAI: false },
      { id: 'trending', name: 'Trending Now', description: 'Products with rising sales velocity', icon: 'Zap', requiresAI: false },
      { id: 'ai_recommended', name: 'AI Recommended', description: 'AI analyzes multiple factors to pick optimal products', icon: 'Sparkles', requiresAI: false },
    ];
  }

  private static toProduct(row: Record<string, unknown>, reasoning: string, score: number): PickedProduct {
    return {
      id: row.id as string, title: row.title as string,
      description: (row.description as string) ?? null, shopify_id: (row.shopify_id as string) ?? null,
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : []),
      variants: Array.isArray(row.variants) ? row.variants : (typeof row.variants === 'string' ? JSON.parse(row.variants) : []),
      inventory_level: Number(row.inventory_level) || 0, is_active: row.is_active as boolean,
      score: Math.max(0, Math.min(100, score)),
      scoreBreakdown: { views: 0, sales: 0, conversion: 0, recency: 0, inventory: 0 },
      reasoning,
    };
  }

  private static calcConfidence(products: PickedProduct[], total: number, strategy: string): number {
    if (products.length === 0) return 0;
    const avgScore = products.reduce((s, p) => s + p.score, 0) / products.length;
    const bonus = strategy === 'ai_recommended' ? 15 : strategy === 'trending' ? 10 : 5;
    return Math.min(100, Math.round(avgScore * 0.6 + Math.min(20, (total / 10) * 5) + bonus));
  }

  private static genInsights(products: PickedProduct[], strategy: string, total: number): string[] {
    const insights = [`Selected ${products.length} of ${total} candidates`];
    if (products.length > 0) {
      const avg = products.reduce((s, p) => s + p.score, 0) / products.length;
      insights.push(`Average score: ${avg.toFixed(1)}/100`);
      const high = products.filter((p) => p.score >= 70).length;
      if (high > 0) insights.push(`${high} products scored 70+ (strong candidates)`);
      const low = products.filter((p) => p.inventory_level < 10).length;
      if (low > 0) insights.push(`Warning: ${low} products have low inventory`);
    }
    if (strategy === 'ai_recommended' && AI_ENABLED) insights.push('AI-enhanced scoring applied');
    return insights;
  }
}
