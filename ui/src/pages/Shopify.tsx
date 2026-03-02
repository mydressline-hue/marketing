import { useState, useCallback } from 'react';
import {
  ShoppingBag,
  RefreshCw,
  Package,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Clock,
  Link2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';
import DataTable from '../components/shared/DataTable';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  [key: string]: unknown;
  id: string;
  title: string;
  sku: string;
  status: string;
  inventory: number;
  variants: number;
  synced: boolean;
  lastSync: string;
}

interface SyncStatus {
  lastSync: string;
  nextSync: string;
  syncHealth: number;
  productsSynced: number;
  inventoryAlerts: number;
  blogPostsSynced: number;
  pixelHealth: number;
  blogStats: {
    published: number;
    drafts: number;
    failed: number;
    seoSynced: number;
    seoTotal: number;
    localizedPosts: number;
    languages: number;
    failedReason: string;
  };
  salesData: { day: string; revenue: number; orders: number }[];
  conversionFunnel: { funnel: string; count: number }[];
  pixelTracking: {
    name: string;
    status: 'connected' | 'not_configured';
    health: 'healthy' | 'warning' | 'inactive';
    detail: string;
    eventsToday: number;
  }[];
  inventoryAlertsList: {
    id: string;
    product: string;
    sku: string;
    currentStock: number;
    reorderPoint: number;
    message: string;
  }[];
  upsellIntegrations: {
    name: string;
    status: string;
    conversionRate: number;
    revenueImpact: string;
  }[];
  totalUpsellRevenue: string;
  kpiChanges: {
    productsSynced: number;
    inventoryAlerts: number;
    blogPostsSynced: number;
    pixelHealth: number;
  };
}

interface Webhook {
  [key: string]: unknown;
  topic: string;
  endpoint: string;
  status: string;
  lastTriggered: string;
}

interface SyncResponse {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  val >= 1_000 ? `$${(val / 1_000).toFixed(1)}K` : `$${val}`;

const pixelHealthColor = (health: string) => {
  if (health === 'healthy') return 'text-green-600';
  if (health === 'warning') return 'text-yellow-600';
  return 'text-surface-400';
};

const pixelHealthBg = (health: string) => {
  if (health === 'healthy') return 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30';
  if (health === 'warning') return 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/30';
  return 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Shopify() {
  const [syncFrequency, setSyncFrequency] = useState('15');

  // ---- API queries ----
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useApiQuery<Product[]>('/v1/products');

  const {
    data: syncStatus,
    loading: syncLoading,
    error: syncError,
    refetch: refetchSync,
  } = useApiQuery<SyncStatus>('/v1/integrations/shopify/products');

  const {
    data: webhooks,
    loading: webhooksLoading,
    error: webhooksError,
    refetch: refetchWebhooks,
  } = useApiQuery<Webhook[]>('/v1/integrations/shopify/webhooks');

  // ---- API mutations ----
  const { mutate: triggerSync, loading: isSyncing } =
    useApiMutation<SyncResponse>('/v1/integrations/shopify/sync', { method: 'POST' });

  const { mutate: runAgent, loading: agentRunning } =
    useApiMutation<unknown>('/v1/agents/shopify/run', { method: 'POST' });

  // ---- Handlers ----
  const handleManualSync = useCallback(async () => {
    try {
      await triggerSync({});
      refetchProducts();
      refetchSync();
      refetchWebhooks();
    } catch {
      // error state handled by mutation hook
    }
  }, [triggerSync, refetchProducts, refetchSync, refetchWebhooks]);

  const handleRunAgent = useCallback(async () => {
    try {
      await runAgent({});
      refetchProducts();
      refetchSync();
    } catch {
      // error state handled by mutation hook
    }
  }, [runAgent, refetchProducts, refetchSync]);

  // ---- Derived data (safe defaults when API hasn't responded yet) ----
  const productList = products ?? [];
  const sync = syncStatus ?? null;
  const webhookList = webhooks ?? [];

  const inventoryAlerts = sync?.inventoryAlertsList ?? [];
  const pixelTracking = sync?.pixelTracking ?? [];
  const salesData = sync?.salesData ?? [];
  const conversionBarData = sync?.conversionFunnel ?? [];
  const upsellIntegrations = sync?.upsellIntegrations ?? [];

  // ---- Product columns ----
  const productColumns = [
    {
      key: 'title',
      label: 'Product',
      render: (item: Product) => (
        <div>
          <p className="font-medium text-surface-900 dark:text-surface-100">{item.title}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400">{item.sku}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: Product) => <StatusBadge status={item.status} />,
    },
    {
      key: 'inventory',
      label: 'Inventory',
      render: (item: Product) => (
        <span
          className={`font-medium ${
            item.inventory <= 10
              ? 'text-red-600'
              : item.inventory <= 50
                ? 'text-yellow-600'
                : 'text-surface-900 dark:text-surface-100'
          }`}
        >
          {item.inventory.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'variants',
      label: 'Variants',
      render: (item: Product) => (
        <span className="text-surface-700 dark:text-surface-200">{item.variants}</span>
      ),
    },
    {
      key: 'synced',
      label: 'Synced',
      render: (item: Product) =>
        item.synced ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <span className="text-red-400 text-sm font-medium">--</span>
        ),
    },
    {
      key: 'lastSync',
      label: 'Last Sync',
      render: (item: Product) => (
        <span className="text-sm text-surface-500 dark:text-surface-400">{item.lastSync}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item: Product) => (
        <div className="flex items-center gap-2">
          <button className="text-xs text-primary-600 hover:text-primary-800 font-medium">
            Sync
          </button>
          <a
            href={`https://admin.shopify.com/products/${item.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-surface-400 hover:text-surface-600"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Shopify Integration"
        subtitle="Product Sync, Inventory Management & Conversion Tracking"
        icon={<ShoppingBag className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="flex items-center gap-1.5 text-sm text-surface-600 dark:text-surface-300 hover:text-surface-800 dark:hover:text-surface-200 font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${agentRunning ? 'animate-spin' : ''}`} />
              {agentRunning ? 'Running Agent...' : 'Run Agent'}
            </button>
            <a
              href="https://admin.shopify.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Open Shopify Admin
            </a>
          </div>
        }
      />

      {/* KPI Row */}
      {syncLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
              <CardSkeleton lines={2} />
            </div>
          ))}
        </div>
      ) : syncError ? (
        <ApiErrorDisplay error={syncError} onRetry={refetchSync} message="Failed to load KPIs" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Products Synced"
            value={sync?.productsSynced ?? 0}
            change={sync?.kpiChanges?.productsSynced ?? 0}
            trend="up"
          />
          <KPICard
            label="Inventory Alerts"
            value={sync?.inventoryAlerts ?? 0}
            change={sync?.kpiChanges?.inventoryAlerts ?? 0}
            trend="down"
          />
          <KPICard
            label="Blog Posts Synced"
            value={sync?.blogPostsSynced ?? 0}
            change={sync?.kpiChanges?.blogPostsSynced ?? 0}
            trend="up"
          />
          <KPICard
            label="Pixel Health"
            value={String(sync?.pixelHealth ?? 0)}
            change={sync?.kpiChanges?.pixelHealth ?? 0}
            trend="up"
            suffix="%"
          />
        </div>
      )}

      {/* Sync Status + Blog/Content Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sync Status Card */}
        <Card
          title="Sync Status"
          subtitle="Real-time product synchronization"
          actions={<Clock className="w-4 h-4 text-surface-400" />}
        >
          {syncLoading ? (
            <CardSkeleton lines={5} />
          ) : syncError ? (
            <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-600 dark:text-surface-300">Last Sync</span>
                <span className="text-sm font-medium text-surface-900 dark:text-surface-100 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  {sync?.lastSync ?? '--'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-600 dark:text-surface-300">Next Scheduled Sync</span>
                <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
                  {sync?.nextSync ?? '--'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-600 dark:text-surface-300">Sync Frequency</span>
                <select
                  value={syncFrequency}
                  onChange={(e) => setSyncFrequency(e.target.value)}
                  className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-1.5 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                  <option value="5">Every 5 minutes</option>
                  <option value="15">Every 15 minutes</option>
                  <option value="30">Every 30 minutes</option>
                  <option value="60">Every 1 hour</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-600 dark:text-surface-300">Sync Health</span>
                <ProgressBar
                  value={sync?.syncHealth ?? 0}
                  color="success"
                  size="sm"
                  showValue
                  label=""
                />
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Manual Sync Now'}
              </button>
            </div>
          )}
        </Card>

        {/* Blog / Content Sync */}
        <Card
          title="Blog & Content Sync"
          subtitle="Shopify blog post synchronization"
          actions={<Link2 className="w-4 h-4 text-surface-400" />}
        >
          {syncLoading ? (
            <CardSkeleton lines={5} />
          ) : syncError ? (
            <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {sync?.blogStats?.published ?? 0}
                  </p>
                  <p className="text-xs text-green-600 font-medium mt-1">Published</p>
                </div>
                <div className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-surface-700 dark:text-surface-200">
                    {sync?.blogStats?.drafts ?? 0}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 font-medium mt-1">Drafts</p>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {sync?.blogStats?.failed ?? 0}
                  </p>
                  <p className="text-xs text-red-600 font-medium mt-1">Failed</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-300">SEO Metadata Synced</span>
                  <span className="font-medium text-surface-900 dark:text-surface-100">
                    {sync?.blogStats?.seoSynced ?? 0} / {sync?.blogStats?.seoTotal ?? 0}
                  </span>
                </div>
                <ProgressBar
                  value={sync?.blogStats?.seoSynced ?? 0}
                  max={sync?.blogStats?.seoTotal ?? 1}
                  color="primary"
                  size="sm"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-300">Localized Versions</span>
                  <span className="font-medium text-surface-900 dark:text-surface-100">
                    {sync?.blogStats?.localizedPosts ?? 0} posts across{' '}
                    {sync?.blogStats?.languages ?? 0} languages
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-300">Failed Posts</span>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="font-medium text-red-600">
                      {sync?.blogStats?.failed ?? 0} sync errors
                      {sync?.blogStats?.failedReason
                        ? ` - ${sync.blogStats.failedReason}`
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Products Table */}
      <Card
        title="Products"
        subtitle="Shopify product catalog sync status"
        noPadding
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500 dark:text-surface-400">
              {productList.length} total products
            </span>
            <Package className="w-4 h-4 text-surface-400" />
          </div>
        }
      >
        {productsLoading ? (
          <TableSkeleton rows={6} columns={7} />
        ) : productsError ? (
          <ApiErrorDisplay
            error={productsError}
            onRetry={refetchProducts}
            message="Failed to load products"
          />
        ) : productList.length === 0 ? (
          <EmptyState
            icon={<Package className="w-6 h-6 text-surface-400" />}
            title="No products found"
            description="Connect your Shopify store to sync products."
          />
        ) : (
          <DataTable columns={productColumns} data={productList} />
        )}
      </Card>

      {/* Inventory Alerts */}
      <Card
        title="Inventory Alerts"
        subtitle="Products below reorder threshold"
        actions={
          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {inventoryAlerts.length} alerts
          </span>
        }
      >
        {syncLoading ? (
          <CardSkeleton lines={3} />
        ) : syncError ? (
          <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
        ) : inventoryAlerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-6 h-6 text-green-500" />}
            title="No inventory alerts"
            description="All products are above their reorder thresholds."
          />
        ) : (
          <div className="space-y-3">
            {inventoryAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-lg border-l-4 border-l-red-500 bg-red-50 dark:bg-red-500/10 p-3"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{alert.product}</p>
                    <span className="text-xs text-surface-500 dark:text-surface-400">{alert.sku}</span>
                  </div>
                  <p className="text-sm text-surface-600 dark:text-surface-300 mt-0.5">{alert.message}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-surface-500 dark:text-surface-400">
                      Current:{' '}
                      <span className="font-semibold text-red-600">{alert.currentStock}</span>
                    </span>
                    <span className="text-xs text-surface-500 dark:text-surface-400">
                      Reorder Point:{' '}
                      <span className="font-semibold text-surface-700 dark:text-surface-200">
                        {alert.reorderPoint}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pixel & Conversion Tracking + Webhook Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pixel & Conversion Tracking */}
        <Card
          title="Pixel & Conversion Tracking"
          subtitle="Tracking validation across platforms"
        >
          {syncLoading ? (
            <CardSkeleton lines={4} />
          ) : syncError ? (
            <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
          ) : pixelTracking.length === 0 ? (
            <EmptyState
              title="No tracking pixels configured"
              description="Add tracking pixels from your Shopify admin."
            />
          ) : (
            <div className="space-y-3">
              {pixelTracking.map((pixel) => (
                <div
                  key={pixel.name}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${pixelHealthBg(pixel.health)}`}
                >
                  <div className="mt-0.5">
                    {pixel.health === 'healthy' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : pixel.health === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-surface-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{pixel.name}</p>
                      <StatusBadge
                        status={
                          pixel.status === 'connected'
                            ? pixel.health === 'healthy'
                              ? 'active'
                              : 'warning'
                            : 'pending'
                        }
                      />
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-300 mt-1">{pixel.detail}</p>
                    {pixel.eventsToday > 0 && (
                      <p
                        className={`text-xs mt-1 font-medium ${pixelHealthColor(pixel.health)}`}
                      >
                        {pixel.eventsToday.toLocaleString()} events today
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Webhook Status */}
        <Card
          title="Webhook Status"
          subtitle="Active Shopify webhooks"
          actions={
            <span className="text-xs text-surface-500 dark:text-surface-400">{webhookList.length} active</span>
          }
        >
          {webhooksLoading ? (
            <CardSkeleton lines={7} />
          ) : webhooksError ? (
            <ApiErrorDisplay error={webhooksError} onRetry={refetchWebhooks} />
          ) : webhookList.length === 0 ? (
            <EmptyState
              title="No webhooks registered"
              description="Register Shopify webhooks to receive real-time event notifications."
            />
          ) : (
            <div className="space-y-2">
              {webhookList.map((wh) => (
                <div
                  key={wh.topic}
                  className="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-200">{wh.topic}</p>
                      <p className="text-xs text-surface-400 dark:text-surface-500">{wh.endpoint}</p>
                    </div>
                  </div>
                  <span className="text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
                    {wh.lastTriggered}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sales Performance Chart */}
      <Card
        title="Sales Performance"
        subtitle="Shopify revenue & orders - last 30 days"
      >
        {syncLoading ? (
          <div className="h-80 flex items-center justify-center">
            <CardSkeleton lines={6} />
          </div>
        ) : syncError ? (
          <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
        ) : salesData.length === 0 ? (
          <EmptyState
            title="No sales data"
            description="Sales data will appear once orders start flowing through Shopify."
          />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={salesData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  interval={4}
                />
                <YAxis
                  yAxisId="revenue"
                  tickFormatter={(val: number) => formatCurrency(val)}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number | undefined, name?: string) =>
                    name === 'Revenue' ? `$${(value ?? 0).toLocaleString()}` : (value ?? 0)
                  }
                />
                <Line
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  name="Revenue"
                />
                <Line
                  yAxisId="orders"
                  type="monotone"
                  dataKey="orders"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Orders"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Upsell / Funnel Integration + Conversion Funnel Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card
          title="Conversion Funnel"
          subtitle="Shopify storefront conversion breakdown"
        >
          {syncLoading ? (
            <div className="h-72 flex items-center justify-center">
              <CardSkeleton lines={6} />
            </div>
          ) : syncError ? (
            <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
          ) : conversionBarData.length === 0 ? (
            <EmptyState
              title="No conversion data"
              description="Conversion funnel data will populate as traffic flows through your store."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={conversionBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    horizontal={false}
                  />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis
                    dataKey="funnel"
                    type="category"
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                    formatter={(value: number | undefined) => (value ?? 0).toLocaleString()}
                  />
                  <Bar
                    dataKey="count"
                    fill="#6366f1"
                    radius={[0, 4, 4, 0]}
                    name="Count"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Upsell / Funnel Integration Status */}
        <Card
          title="Upsell & Funnel Integrations"
          subtitle="Post-purchase and in-cart upsell performance"
        >
          {syncLoading ? (
            <CardSkeleton lines={6} />
          ) : syncError ? (
            <ApiErrorDisplay error={syncError} onRetry={refetchSync} />
          ) : upsellIntegrations.length === 0 ? (
            <EmptyState
              title="No upsell integrations"
              description="Configure upsell integrations in your Shopify app settings."
            />
          ) : (
            <div className="space-y-3">
              {upsellIntegrations.map((integration) => (
                <div
                  key={integration.name}
                  className="rounded-lg border border-surface-200 dark:border-surface-700 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                      {integration.name}
                    </p>
                    <StatusBadge status={integration.status} />
                  </div>
                  {integration.status === 'active' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-surface-500 dark:text-surface-400">Conversion Rate</p>
                        <p className="text-lg font-bold text-surface-900 dark:text-surface-100">
                          {integration.conversionRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-surface-500 dark:text-surface-400">Revenue Impact</p>
                        <p className="text-lg font-bold text-green-600">
                          {integration.revenueImpact}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      Not yet activated. Configure in Shopify app settings to enable.
                    </p>
                  )}
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-surface-100 dark:border-surface-700 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                    Total Upsell Revenue
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    Across all active integrations
                  </p>
                </div>
                <p className="text-xl font-bold text-green-600">
                  {sync?.totalUpsellRevenue ?? '$0'}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
