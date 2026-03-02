/**
 * Product Analytics Service.
 *
 * Tracks and analyzes product performance: views, sales, conversion
 * rates, popularity scores, and trend data.
 */

import { pool } from '../../config/database';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewEvent { productId: string; source?: string; sessionId?: string; }
export interface SaleEvent { productId: string; quantity: number; revenue: number; orderId?: string; }

export interface AnalyticsSummary {
  totalProducts: number;
  activeProducts: number;
  totalViews: number;
  totalSales: number;
  totalRevenue: number;
  avgConversionRate: number;
  viewsToday: number;
  salesToday: number;
  revenueToday: number;
  viewsChange: number;
  salesChange: number;
  revenueChange: number;
  topSources: { source: string; count: number }[];
  productsNeedingAttention: {
    poorConversion: { id: string; title: string; views: number; sales: number; conversionRate: number }[];
    noRecentViews: { id: string; title: string; lastViewed: string | null }[];
    lowInventory: { id: string; title: string; inventory: number; dailySales: number }[];
  };
}

export interface TrendPoint { date: string; views: number; sales: number; revenue: number; }

export interface TopProduct {
  id: string;
  title: string;
  views: number;
  sales: number;
  revenue: number;
  conversionRate: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProductAnalyticsService {
  static async initTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_views (
        id VARCHAR(255) PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        source VARCHAR(100) DEFAULT 'direct',
        metadata JSONB DEFAULT '{}'::jsonb,
        viewed_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS product_sales (
        id VARCHAR(255) PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL,
        order_id VARCHAR(255),
        quantity INTEGER DEFAULT 1,
        revenue NUMERIC(12, 2) DEFAULT 0,
        source VARCHAR(100) DEFAULT 'direct',
        sold_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pv_product ON product_views(product_id);
      CREATE INDEX IF NOT EXISTS idx_pv_viewed_at ON product_views(viewed_at);
      CREATE INDEX IF NOT EXISTS idx_ps_product ON product_sales(product_id);
      CREATE INDEX IF NOT EXISTS idx_ps_sold_at ON product_sales(sold_at);
    `);
  }

  static async recordView(event: ViewEvent): Promise<{ id: string }> {
    const id = generateId();
    await pool.query(
      `INSERT INTO product_views (id, product_id, source, metadata, viewed_at) VALUES ($1, $2, $3, $4, NOW())`,
      [id, event.productId, event.source ?? 'direct', JSON.stringify({ sessionId: event.sessionId })]);
    logger.info('Product view recorded', { productId: event.productId, source: event.source });
    return { id };
  }

  static async recordSale(event: SaleEvent): Promise<{ id: string }> {
    const id = generateId();
    await pool.query(
      `INSERT INTO product_sales (id, product_id, order_id, quantity, revenue, sold_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, event.productId, event.orderId ?? null, event.quantity, event.revenue]);
    logger.info('Product sale recorded', { productId: event.productId, quantity: event.quantity, revenue: event.revenue });
    return { id };
  }

  static async getSummary(_options: { startDate?: string; endDate?: string } = {}): Promise<AnalyticsSummary> {
    const [prodCount, viewsAll, salesAll, viewsToday, salesToday, viewsYesterday, salesYesterday, sources, poorConv, noViews, lowInv] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM products'),
      pool.query('SELECT COUNT(*) AS c FROM product_views'),
      pool.query('SELECT COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(revenue), 0) AS r FROM product_sales'),
      pool.query("SELECT COUNT(*) AS c FROM product_views WHERE viewed_at >= CURRENT_DATE"),
      pool.query("SELECT COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(revenue), 0) AS r FROM product_sales WHERE sold_at >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*) AS c FROM product_views WHERE viewed_at >= CURRENT_DATE - INTERVAL '1 day' AND viewed_at < CURRENT_DATE"),
      pool.query("SELECT COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(revenue), 0) AS r FROM product_sales WHERE sold_at >= CURRENT_DATE - INTERVAL '1 day' AND sold_at < CURRENT_DATE"),
      pool.query("SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS count FROM product_views GROUP BY source ORDER BY count DESC LIMIT 5"),
      pool.query(`SELECT p.id, p.title, COALESCE(v.vc, 0) AS views, COALESCE(s.sc, 0) AS sales
        FROM products p
        LEFT JOIN (SELECT product_id, COUNT(*) AS vc FROM product_views GROUP BY product_id) v ON v.product_id = p.id
        LEFT JOIN (SELECT product_id, SUM(quantity) AS sc FROM product_sales GROUP BY product_id) s ON s.product_id = p.id
        WHERE p.is_active AND COALESCE(v.vc, 0) > 10 AND COALESCE(s.sc, 0) = 0 LIMIT 5`),
      pool.query(`SELECT p.id, p.title, MAX(pv.viewed_at)::text AS last_viewed FROM products p
        LEFT JOIN product_views pv ON pv.product_id = p.id WHERE p.is_active
        GROUP BY p.id, p.title HAVING MAX(pv.viewed_at) IS NULL OR MAX(pv.viewed_at) < NOW() - INTERVAL '30 days' LIMIT 5`),
      pool.query(`SELECT p.id, p.title, p.inventory_level AS inventory, COALESCE(ds.daily, 0) AS daily_sales
        FROM products p LEFT JOIN (SELECT product_id, COALESCE(SUM(quantity) / GREATEST(1, EXTRACT(DAY FROM NOW() - MIN(sold_at))), 0) AS daily
        FROM product_sales GROUP BY product_id) ds ON ds.product_id = p.id WHERE p.is_active AND p.inventory_level < 10 LIMIT 5`),
    ]);

    const totalViews = parseInt(viewsAll.rows[0].c as string, 10);
    const totalSales = Number(salesAll.rows[0].q);
    const vToday = parseInt(viewsToday.rows[0].c as string, 10);
    const sToday = Number(salesToday.rows[0].q);
    const rToday = Number(salesToday.rows[0].r);
    const vYesterday = parseInt(viewsYesterday.rows[0].c as string, 10);
    const sYesterday = Number(salesYesterday.rows[0].q);
    const rYesterday = Number(salesYesterday.rows[0].r);

    return {
      totalProducts: parseInt(prodCount.rows[0].total as string, 10),
      activeProducts: parseInt(prodCount.rows[0].active as string, 10),
      totalViews, totalSales, totalRevenue: Number(salesAll.rows[0].r),
      avgConversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0,
      viewsToday: vToday, salesToday: sToday, revenueToday: rToday,
      viewsChange: vYesterday > 0 ? ((vToday - vYesterday) / vYesterday) * 100 : 0,
      salesChange: sYesterday > 0 ? ((sToday - sYesterday) / sYesterday) * 100 : 0,
      revenueChange: rYesterday > 0 ? ((rToday - rYesterday) / rYesterday) * 100 : 0,
      topSources: sources.rows.map((r: Record<string, unknown>) => ({ source: r.source as string, count: parseInt(r.count as string, 10) })),
      productsNeedingAttention: {
        poorConversion: poorConv.rows.map((r: Record<string, unknown>) => ({
          id: r.id as string, title: r.title as string, views: Number(r.views), sales: Number(r.sales),
          conversionRate: Number(r.views) > 0 ? (Number(r.sales) / Number(r.views)) * 100 : 0,
        })),
        noRecentViews: noViews.rows.map((r: Record<string, unknown>) => ({ id: r.id as string, title: r.title as string, lastViewed: (r.last_viewed as string) ?? null })),
        lowInventory: lowInv.rows.map((r: Record<string, unknown>) => ({ id: r.id as string, title: r.title as string, inventory: Number(r.inventory), dailySales: Number(r.daily_sales) })),
      },
    };
  }

  static async getTrends(options: { startDate?: string; endDate?: string; granularity?: string } = {}): Promise<TrendPoint[]> {
    const days = options.granularity === '7d' ? 7 : options.granularity === '90d' ? 90 : 30;
    const result = await pool.query(
      `SELECT d::date AS date,
        COALESCE(v.c, 0) AS views,
        COALESCE(s.q, 0) AS sales,
        COALESCE(s.r, 0) AS revenue
       FROM generate_series(CURRENT_DATE - $1 * INTERVAL '1 day', CURRENT_DATE, '1 day') d
       LEFT JOIN (SELECT viewed_at::date AS dt, COUNT(*) AS c FROM product_views GROUP BY dt) v ON v.dt = d::date
       LEFT JOIN (SELECT sold_at::date AS dt, SUM(quantity) AS q, SUM(revenue) AS r FROM product_sales GROUP BY dt) s ON s.dt = d::date
       ORDER BY d`,
      [days]);
    return result.rows.map((r: Record<string, unknown>) => ({
      date: (r.date as Date).toISOString().split('T')[0],
      views: Number(r.views), sales: Number(r.sales), revenue: Number(r.revenue),
    }));
  }

  static async getTopProducts(options: { metric?: string; period?: string; limit?: number } = {}): Promise<TopProduct[]> {
    const limit = options.limit ?? 10;
    const periodDays = options.period === '7d' ? 7 : options.period === '90d' ? 90 : 30;
    const orderCol = options.metric === 'sales' ? 'sales' : options.metric === 'revenue' ? 'revenue'
      : options.metric === 'score' ? 'score' : 'views';

    const result = await pool.query(
      `SELECT p.id, p.title,
        COALESCE(v.vc, 0) AS views, COALESCE(s.sq, 0) AS sales, COALESCE(s.sr, 0) AS revenue,
        CASE WHEN COALESCE(v.vc, 0) > 0 THEN (COALESCE(s.sq, 0)::float / v.vc) * 100 ELSE 0 END AS conversion_rate,
        (COALESCE(v.vc, 0) * 0.2 + COALESCE(s.sq, 0) * 10 * 0.3 +
         CASE WHEN COALESCE(v.vc, 0) > 0 THEN (COALESCE(s.sq, 0)::float / v.vc) * 100 ELSE 0 END * 0.2 +
         LEAST(p.inventory_level, 100) * 0.15) AS score
       FROM products p
       LEFT JOIN (SELECT product_id, COUNT(*) AS vc FROM product_views WHERE viewed_at >= NOW() - $1 * INTERVAL '1 day' GROUP BY product_id) v ON v.product_id = p.id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS sq, SUM(revenue) AS sr FROM product_sales WHERE sold_at >= NOW() - $1 * INTERVAL '1 day' GROUP BY product_id) s ON s.product_id = p.id
       WHERE p.is_active ORDER BY ${orderCol} DESC LIMIT $2`,
      [periodDays, limit]);

    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string, title: r.title as string,
      views: Number(r.views), sales: Number(r.sales), revenue: Number(r.revenue),
      conversionRate: Number(r.conversion_rate), score: Math.min(100, Number(r.score)),
    }));
  }

  static async getProductAnalytics(productId: string, _options: { startDate?: string; endDate?: string } = {}): Promise<Record<string, unknown>> {
    const [product, views, sales, trends] = await Promise.all([
      pool.query('SELECT id, title FROM products WHERE id = $1', [productId]),
      pool.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL \'7 days\') AS week, COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL \'30 days\') AS month FROM product_views WHERE product_id = $1', [productId]),
      pool.query('SELECT COALESCE(SUM(quantity), 0) AS total, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(quantity) FILTER (WHERE sold_at >= NOW() - INTERVAL \'7 days\'), 0) AS week, COALESCE(SUM(quantity) FILTER (WHERE sold_at >= NOW() - INTERVAL \'30 days\'), 0) AS month FROM product_sales WHERE product_id = $1', [productId]),
      pool.query(`SELECT d::date AS date, COALESCE(v.c, 0) AS views, COALESCE(s.q, 0) AS sales
        FROM generate_series(CURRENT_DATE - 30 * INTERVAL '1 day', CURRENT_DATE, '1 day') d
        LEFT JOIN (SELECT viewed_at::date AS dt, COUNT(*) AS c FROM product_views WHERE product_id = $1 GROUP BY dt) v ON v.dt = d::date
        LEFT JOIN (SELECT sold_at::date AS dt, SUM(quantity) AS q FROM product_sales WHERE product_id = $1 GROUP BY dt) s ON s.dt = d::date ORDER BY d`, [productId]),
    ]);

    const totalViews = Number(views.rows[0].total);
    const totalSales = Number(sales.rows[0].total);

    return {
      product: product.rows[0] ?? { id: productId, title: 'Unknown' },
      views: { total: totalViews, week: Number(views.rows[0].week), month: Number(views.rows[0].month) },
      sales: { total: totalSales, revenue: Number(sales.rows[0].revenue), week: Number(sales.rows[0].week), month: Number(sales.rows[0].month) },
      conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0,
      trends: trends.rows.map((r: Record<string, unknown>) => ({ date: (r.date as Date).toISOString().split('T')[0], views: Number(r.views), sales: Number(r.sales) })),
    };
  }

  static async getCollectionAnalytics(_options: { startDate?: string; endDate?: string } = {}): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT sc.id, sc.title, sc.product_count,
        COALESCE(SUM(v.vc), 0) AS total_views, COALESCE(SUM(s.sq), 0) AS total_sales, COALESCE(SUM(s.sr), 0) AS total_revenue
       FROM shopify_collections sc
       LEFT JOIN collection_products cp ON cp.collection_id = sc.id
       LEFT JOIN (SELECT product_id, COUNT(*) AS vc FROM product_views GROUP BY product_id) v ON v.product_id = cp.product_id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS sq, SUM(revenue) AS sr FROM product_sales GROUP BY product_id) s ON s.product_id = cp.product_id
       WHERE sc.is_active GROUP BY sc.id, sc.title, sc.product_count ORDER BY total_revenue DESC`);
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id, title: r.title, productCount: Number(r.product_count),
      views: Number(r.total_views), sales: Number(r.total_sales), revenue: Number(r.total_revenue),
    }));
  }
}
