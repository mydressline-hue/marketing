import { useState, useMemo } from 'react';
import { BarChart3, AlertTriangle, Eye, ShoppingCart } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import Card from '../shared/Card';
import KPICard from '../shared/KPICard';
import DataTable from '../shared/DataTable';
import EmptyState from '../shared/EmptyState';
import { CardSkeleton, TableSkeleton } from '../shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../shared/ErrorBoundary';
import { useApiQuery } from '../../hooks/useApi';

interface Summary {
  totalProducts: number; activeProducts: number; totalViews: number; totalSales: number;
  totalRevenue: number; avgConversionRate: number; viewsToday: number; salesToday: number;
  revenueToday: number; viewsChange: number; salesChange: number; revenueChange: number;
  topSources: { source: string; count: number }[];
  productsNeedingAttention: {
    poorConversion: { id: string; title: string; views: number; sales: number; conversionRate: number }[];
    noRecentViews: { id: string; title: string; lastViewed: string | null }[];
    lowInventory: { id: string; title: string; inventory: number; dailySales: number }[];
  };
}
interface TrendPoint { date: string; views: number; sales: number; revenue: number; }
interface TopProduct { [key: string]: unknown; id: string; title: string; views: number; sales: number; revenue: number; conversionRate: number; score: number; }
interface CollectionPerf { id: string; title: string; views: number; sales: number; revenue: number; }

export default function ProductAnalyticsDashboard() {
  const [trendPeriod, setTrendPeriod] = useState('30d');
  const [topMetric, setTopMetric] = useState('views');
  const [topPeriod, setTopPeriod] = useState('30d');

  const { data: summaryData, loading: sumLoading, error: sumError, refetch: refetchSum } = useApiQuery<{ data: Summary }>('/v1/products/analytics/summary');
  const { data: trendData, loading: trendLoading, error: trendError, refetch: refetchTrend } = useApiQuery<{ data: TrendPoint[] }>('/v1/products/analytics/trends', { params: { granularity: trendPeriod } });
  const { data: topData, loading: topLoading, error: topError, refetch: refetchTop } = useApiQuery<{ data: TopProduct[] }>('/v1/products/analytics/top', { params: { metric: topMetric, period: topPeriod, limit: '10' } });
  const { data: colData, loading: colLoading, error: colError, refetch: refetchCol } = useApiQuery<{ data: CollectionPerf[] }>('/v1/products/analytics/collections');

  const summary = summaryData?.data;
  const trends = trendData?.data ?? [];
  const topProducts = topData?.data ?? [];
  const collectionPerf = colData?.data ?? [];
  const attention = summary?.productsNeedingAttention;

  const topColumns = useMemo(() => [
    { key: 'title', label: 'Product', render: (p: TopProduct) => <span className="font-medium text-surface-900 dark:text-surface-100">{p.title}</span> },
    { key: 'views', label: 'Views', render: (p: TopProduct) => <span>{p.views.toLocaleString()}</span> },
    { key: 'sales', label: 'Sales', render: (p: TopProduct) => <span>{p.sales.toLocaleString()}</span> },
    { key: 'conversionRate', label: 'Conv.', render: (p: TopProduct) => <span className={p.conversionRate > 5 ? 'text-green-600' : p.conversionRate > 2 ? 'text-yellow-600' : 'text-red-600'}>{p.conversionRate.toFixed(1)}%</span> },
    { key: 'revenue', label: 'Revenue', render: (p: TopProduct) => <span className="font-medium">${p.revenue.toLocaleString()}</span> },
    { key: 'score', label: 'Score', render: (p: TopProduct) => (
      <div className="flex items-center gap-2"><div className="w-12 h-1.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full" style={{ width: `${p.score}%` }} /></div><span className="text-xs">{Math.round(p.score)}</span></div>
    )},
  ], []);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      {sumLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5"><CardSkeleton lines={2} /></div>)}</div>
      ) : sumError ? <ApiErrorDisplay error={sumError} onRetry={refetchSum} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Views Today" value={summary?.viewsToday ?? 0} change={summary?.viewsChange ?? 0} trend="up" />
          <KPICard label="Sales Today" value={summary?.salesToday ?? 0} change={summary?.salesChange ?? 0} trend="up" />
          <KPICard label="Avg Conversion" value={`${(summary?.avgConversionRate ?? 0).toFixed(1)}%`} change={0} trend="up" />
          <KPICard label="Revenue Today" value={`$${(summary?.revenueToday ?? 0).toLocaleString()}`} change={summary?.revenueChange ?? 0} trend="up" />
        </div>
      )}

      {/* Trend Chart */}
      <Card title="Views & Sales Trends" actions={
        <div className="flex gap-1">{['7d', '30d', '90d'].map(p => (
          <button key={p} onClick={() => setTrendPeriod(p)} className={`px-2.5 py-1 text-xs rounded-lg font-medium ${trendPeriod === p ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700'}`}>{p}</button>
        ))}</div>
      }>
        {trendLoading ? <CardSkeleton lines={6} /> : trendError ? <ApiErrorDisplay error={trendError} onRetry={refetchTrend} /> : trends.length === 0 ? <EmptyState title="No trend data" description="Data will appear as events are recorded." /> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: string) => v.slice(5)} />
                <YAxis yAxisId="views" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Line yAxisId="views" type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={2} dot={false} name="Views" />
                <Line yAxisId="sales" type="monotone" dataKey="sales" stroke="#22c55e" strokeWidth={2} dot={false} name="Sales" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Top Products */}
      <Card title="Top Products" noPadding actions={
        <div className="flex items-center gap-2">
          <select value={topMetric} onChange={e => setTopMetric(e.target.value)} className="text-xs border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200">
            <option value="views">By Views</option><option value="sales">By Sales</option><option value="revenue">By Revenue</option><option value="score">By Score</option>
          </select>
          <select value={topPeriod} onChange={e => setTopPeriod(e.target.value)} className="text-xs border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200">
            <option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option>
          </select>
        </div>
      }>
        {topLoading ? <TableSkeleton rows={5} columns={6} /> : topError ? <ApiErrorDisplay error={topError} onRetry={refetchTop} /> : topProducts.length === 0 ? <EmptyState title="No data" description="Product analytics will appear as data flows in." /> : (
          <DataTable columns={topColumns} data={topProducts} />
        )}
      </Card>

      {/* Attention */}
      {attention && (attention.poorConversion.length > 0 || attention.noRecentViews.length > 0 || attention.lowInventory.length > 0) && (
        <Card title="Products Needing Attention" actions={<AlertTriangle className="w-4 h-4 text-yellow-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {attention.poorConversion.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Poor Conversion ({attention.poorConversion.length})</p>
                {attention.poorConversion.slice(0, 3).map(p => <p key={p.id} className="text-xs text-surface-600 dark:text-surface-300">{p.title} - {p.views} views, {p.sales} sales</p>)}
              </div>
            )}
            {attention.noRecentViews.length > 0 && (
              <div className="rounded-lg border border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 p-3">
                <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> No Recent Views ({attention.noRecentViews.length})</p>
                {attention.noRecentViews.slice(0, 3).map(p => <p key={p.id} className="text-xs text-surface-600 dark:text-surface-300">{p.title}</p>)}
              </div>
            )}
            {attention.lowInventory.length > 0 && (
              <div className="rounded-lg border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 p-3">
                <p className="text-sm font-semibold text-primary-700 dark:text-primary-400 mb-2 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> Low Inventory ({attention.lowInventory.length})</p>
                {attention.lowInventory.slice(0, 3).map(p => <p key={p.id} className="text-xs text-surface-600 dark:text-surface-300">{p.title} - {p.inventory} units</p>)}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Collection Performance */}
      <Card title="Collection Performance">
        {colLoading ? <CardSkeleton lines={6} /> : colError ? <ApiErrorDisplay error={colError} onRetry={refetchCol} /> : collectionPerf.length === 0 ? <EmptyState title="No collections" description="Create collections to see performance data." /> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionPerf} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis dataKey="title" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={120} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="views" fill="#6366f1" name="Views" radius={[0, 2, 2, 0]} />
                <Bar dataKey="sales" fill="#22c55e" name="Sales" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
