import { useState } from 'react';
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

// ---------------------------------------------------------------------------
// Mock data
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

const products: Product[] = [
  {
    id: '1',
    title: 'Organic Vitamin D3 + K2 Softgels',
    sku: 'VIT-D3K2-060',
    status: 'active',
    inventory: 1243,
    variants: 3,
    synced: true,
    lastSync: '2 min ago',
  },
  {
    id: '2',
    title: 'Collagen Peptides Powder (Unflavored)',
    sku: 'COL-PEP-300',
    status: 'active',
    inventory: 867,
    variants: 2,
    synced: true,
    lastSync: '2 min ago',
  },
  {
    id: '3',
    title: 'Probiotic 50 Billion CFU Capsules',
    sku: 'PRO-50B-030',
    status: 'active',
    inventory: 12,
    variants: 1,
    synced: true,
    lastSync: '2 min ago',
  },
  {
    id: '4',
    title: 'Ashwagandha KSM-66 Extract',
    sku: 'ASH-KSM-090',
    status: 'active',
    inventory: 2104,
    variants: 2,
    synced: true,
    lastSync: '2 min ago',
  },
  {
    id: '5',
    title: 'Omega-3 Fish Oil Triple Strength',
    sku: 'OMG-3TS-120',
    status: 'active',
    inventory: 8,
    variants: 4,
    synced: true,
    lastSync: '5 min ago',
  },
  {
    id: '6',
    title: 'Magnesium Glycinate Complex',
    sku: 'MAG-GLY-120',
    status: 'draft',
    inventory: 0,
    variants: 2,
    synced: false,
    lastSync: 'Never',
  },
  {
    id: '7',
    title: 'Elderberry Immune Support Gummies',
    sku: 'ELD-GUM-060',
    status: 'active',
    inventory: 3,
    variants: 1,
    synced: true,
    lastSync: '2 min ago',
  },
  {
    id: '8',
    title: 'Turmeric Curcumin with BioPerine',
    sku: 'TUR-BIO-090',
    status: 'archived',
    inventory: 47,
    variants: 3,
    synced: true,
    lastSync: '1 hr ago',
  },
];

const inventoryAlerts = [
  {
    id: '1',
    product: 'Omega-3 Fish Oil Triple Strength',
    sku: 'OMG-3TS-120',
    currentStock: 8,
    reorderPoint: 50,
    message: 'Stock critically low - 8 units remaining. Reorder immediately.',
  },
  {
    id: '2',
    product: 'Probiotic 50 Billion CFU Capsules',
    sku: 'PRO-50B-030',
    currentStock: 12,
    reorderPoint: 100,
    message: 'Stock below reorder point. 12 units remaining, threshold is 100.',
  },
  {
    id: '3',
    product: 'Elderberry Immune Support Gummies',
    sku: 'ELD-GUM-060',
    currentStock: 3,
    reorderPoint: 75,
    message: 'Nearly out of stock - only 3 units left. Expedited reorder recommended.',
  },
];

const pixelTracking = [
  {
    name: 'Facebook Pixel',
    status: 'connected' as const,
    health: 'healthy' as const,
    detail: 'Firing correctly on all pages. Last event: 14s ago.',
    eventsToday: 4821,
  },
  {
    name: 'Google Analytics',
    status: 'connected' as const,
    health: 'warning' as const,
    detail: 'Connected with minor issues. Enhanced e-commerce missing on /cart page.',
    eventsToday: 6340,
  },
  {
    name: 'TikTok Pixel',
    status: 'connected' as const,
    health: 'healthy' as const,
    detail: 'Firing correctly. ViewContent, AddToCart, and Purchase events verified.',
    eventsToday: 2156,
  },
  {
    name: 'Snapchat Pixel',
    status: 'not_configured' as const,
    health: 'inactive' as const,
    detail: 'Not configured. Add Snap Pixel ID to enable conversion tracking.',
    eventsToday: 0,
  },
];

const webhooks = [
  { topic: 'orders/create', endpoint: '/api/webhooks/order-created', status: 'active', lastTriggered: '3 min ago' },
  { topic: 'orders/updated', endpoint: '/api/webhooks/order-updated', status: 'active', lastTriggered: '8 min ago' },
  { topic: 'products/update', endpoint: '/api/webhooks/product-updated', status: 'active', lastTriggered: '12 min ago' },
  { topic: 'products/create', endpoint: '/api/webhooks/product-created', status: 'active', lastTriggered: '2 hrs ago' },
  { topic: 'inventory_levels/update', endpoint: '/api/webhooks/inventory-update', status: 'active', lastTriggered: '1 min ago' },
  { topic: 'checkouts/create', endpoint: '/api/webhooks/checkout-created', status: 'active', lastTriggered: '6 min ago' },
  { topic: 'refunds/create', endpoint: '/api/webhooks/refund-created', status: 'active', lastTriggered: '4 hrs ago' },
];

const salesData = [
  { day: 'Jan 26', revenue: 4120, orders: 38 },
  { day: 'Jan 27', revenue: 3890, orders: 34 },
  { day: 'Jan 28', revenue: 5210, orders: 47 },
  { day: 'Jan 29', revenue: 4650, orders: 41 },
  { day: 'Jan 30', revenue: 5890, orders: 52 },
  { day: 'Jan 31', revenue: 6210, orders: 55 },
  { day: 'Feb 1', revenue: 5430, orders: 49 },
  { day: 'Feb 2', revenue: 4870, orders: 44 },
  { day: 'Feb 3', revenue: 5100, orders: 46 },
  { day: 'Feb 4', revenue: 5520, orders: 50 },
  { day: 'Feb 5', revenue: 6890, orders: 61 },
  { day: 'Feb 6', revenue: 7120, orders: 64 },
  { day: 'Feb 7', revenue: 6540, orders: 58 },
  { day: 'Feb 8', revenue: 5980, orders: 53 },
  { day: 'Feb 9', revenue: 6320, orders: 56 },
  { day: 'Feb 10', revenue: 7450, orders: 66 },
  { day: 'Feb 11', revenue: 7890, orders: 70 },
  { day: 'Feb 12', revenue: 6980, orders: 62 },
  { day: 'Feb 13', revenue: 7210, orders: 64 },
  { day: 'Feb 14', revenue: 9840, orders: 87 },
  { day: 'Feb 15', revenue: 8120, orders: 72 },
  { day: 'Feb 16', revenue: 7650, orders: 68 },
  { day: 'Feb 17', revenue: 7240, orders: 65 },
  { day: 'Feb 18', revenue: 7890, orders: 70 },
  { day: 'Feb 19', revenue: 8340, orders: 74 },
  { day: 'Feb 20', revenue: 8560, orders: 76 },
  { day: 'Feb 21', revenue: 7940, orders: 71 },
  { day: 'Feb 22', revenue: 8210, orders: 73 },
  { day: 'Feb 23', revenue: 8890, orders: 79 },
  { day: 'Feb 24', revenue: 9120, orders: 81 },
];

const conversionBarData = [
  { funnel: 'Product View', count: 14230 },
  { funnel: 'Add to Cart', count: 4890 },
  { funnel: 'Checkout', count: 2340 },
  { funnel: 'Purchase', count: 1820 },
  { funnel: 'Upsell Shown', count: 1640 },
  { funnel: 'Upsell Accepted', count: 492 },
];

const upsellIntegrations = [
  { name: 'Post-Purchase Upsell', status: 'active', conversionRate: 18.4, revenueImpact: '$12,840' },
  { name: 'Cart Page Cross-Sell', status: 'active', conversionRate: 9.2, revenueImpact: '$6,210' },
  { name: 'Thank You Page Offer', status: 'active', conversionRate: 14.1, revenueImpact: '$8,470' },
  { name: 'In-Checkout Upsell', status: 'draft', conversionRate: 0, revenueImpact: '$0' },
];

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
  if (health === 'healthy') return 'bg-green-50 border-green-200';
  if (health === 'warning') return 'bg-yellow-50 border-yellow-200';
  return 'bg-surface-50 border-surface-200';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Shopify() {
  const [syncFrequency, setSyncFrequency] = useState('15');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  };

  const productColumns = [
    {
      key: 'title',
      label: 'Product',
      render: (item: Product) => (
        <div>
          <p className="font-medium text-surface-900">{item.title}</p>
          <p className="text-xs text-surface-500">{item.sku}</p>
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
                : 'text-surface-900'
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
        <span className="text-surface-700">{item.variants}</span>
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
        <span className="text-sm text-surface-500">{item.lastSync}</span>
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
          <a
            href="https://admin.shopify.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Open Shopify Admin
          </a>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Products Synced" value={248} change={4.2} trend="up" />
        <KPICard label="Inventory Alerts" value={3} change={50} trend="down" />
        <KPICard label="Blog Posts Synced" value={76} change={8.6} trend="up" />
        <KPICard label="Pixel Health" value="98" change={1.2} trend="up" suffix="%" />
      </div>

      {/* Sync Status + Blog/Content Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sync Status Card */}
        <Card
          title="Sync Status"
          subtitle="Real-time product synchronization"
          actions={<Clock className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600">Last Sync</span>
              <span className="text-sm font-medium text-surface-900 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Feb 25, 2026 - 10:42 AM
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600">Next Scheduled Sync</span>
              <span className="text-sm font-medium text-surface-900">
                Feb 25, 2026 - 10:57 AM
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600">Sync Frequency</span>
              <select
                value={syncFrequency}
                onChange={(e) => setSyncFrequency(e.target.value)}
                className="text-sm border border-surface-200 rounded-lg px-3 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 1 hour</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600">Sync Health</span>
              <ProgressBar value={98} color="success" size="sm" showValue label="" />
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
        </Card>

        {/* Blog / Content Sync */}
        <Card
          title="Blog & Content Sync"
          subtitle="Shopify blog post synchronization"
          actions={<Link2 className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">68</p>
                <p className="text-xs text-green-600 font-medium mt-1">Published</p>
              </div>
              <div className="bg-surface-50 border border-surface-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-surface-700">6</p>
                <p className="text-xs text-surface-500 font-medium mt-1">Drafts</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-700">2</p>
                <p className="text-xs text-red-600 font-medium mt-1">Failed</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-600">SEO Metadata Synced</span>
                <span className="font-medium text-surface-900">64 / 68</span>
              </div>
              <ProgressBar value={64} max={68} color="primary" size="sm" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-600">Localized Versions</span>
                <span className="font-medium text-surface-900">142 posts across 4 languages</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-600">Failed Posts</span>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="font-medium text-red-600">2 sync errors - image CDN timeout</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Products Table */}
      <Card
        title="Products"
        subtitle="Shopify product catalog sync status"
        noPadding
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500">248 total products</span>
            <Package className="w-4 h-4 text-surface-400" />
          </div>
        }
      >
        <DataTable columns={productColumns} data={products} />
      </Card>

      {/* Inventory Alerts */}
      <Card
        title="Inventory Alerts"
        subtitle="Products below reorder threshold"
        actions={
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {inventoryAlerts.length} alerts
          </span>
        }
      >
        <div className="space-y-3">
          {inventoryAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border-l-4 border-l-red-500 bg-red-50 p-3"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-surface-900">{alert.product}</p>
                  <span className="text-xs text-surface-500">{alert.sku}</span>
                </div>
                <p className="text-sm text-surface-600 mt-0.5">{alert.message}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-surface-500">
                    Current: <span className="font-semibold text-red-600">{alert.currentStock}</span>
                  </span>
                  <span className="text-xs text-surface-500">
                    Reorder Point: <span className="font-semibold text-surface-700">{alert.reorderPoint}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Pixel & Conversion Tracking + Webhook Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pixel & Conversion Tracking */}
        <Card
          title="Pixel & Conversion Tracking"
          subtitle="Tracking validation across platforms"
        >
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
                    <p className="text-sm font-medium text-surface-900">{pixel.name}</p>
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
                  <p className="text-xs text-surface-600 mt-1">{pixel.detail}</p>
                  {pixel.eventsToday > 0 && (
                    <p className={`text-xs mt-1 font-medium ${pixelHealthColor(pixel.health)}`}>
                      {pixel.eventsToday.toLocaleString()} events today
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Webhook Status */}
        <Card
          title="Webhook Status"
          subtitle="Active Shopify webhooks"
          actions={
            <span className="text-xs text-surface-500">{webhooks.length} active</span>
          }
        >
          <div className="space-y-2">
            {webhooks.map((wh) => (
              <div
                key={wh.topic}
                className="flex items-center justify-between rounded-lg border border-surface-200 bg-surface-50/50 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-surface-800">{wh.topic}</p>
                    <p className="text-xs text-surface-400">{wh.endpoint}</p>
                  </div>
                </div>
                <span className="text-xs text-surface-500 whitespace-nowrap">{wh.lastTriggered}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sales Performance Chart */}
      <Card
        title="Sales Performance"
        subtitle="Shopify revenue & orders - last 30 days"
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                formatter={(value: number, name: string) =>
                  name === 'Revenue' ? `$${value.toLocaleString()}` : value
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
      </Card>

      {/* Upsell / Funnel Integration + Conversion Funnel Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card
          title="Conversion Funnel"
          subtitle="Shopify storefront conversion breakdown"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={conversionBarData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
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
                  formatter={(value: number) => value.toLocaleString()}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Upsell / Funnel Integration Status */}
        <Card
          title="Upsell & Funnel Integrations"
          subtitle="Post-purchase and in-cart upsell performance"
        >
          <div className="space-y-3">
            {upsellIntegrations.map((integration) => (
              <div
                key={integration.name}
                className="rounded-lg border border-surface-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-surface-900">{integration.name}</p>
                  <StatusBadge status={integration.status} />
                </div>
                {integration.status === 'active' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-surface-500">Conversion Rate</p>
                      <p className="text-lg font-bold text-surface-900">
                        {integration.conversionRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-surface-500">Revenue Impact</p>
                      <p className="text-lg font-bold text-green-600">
                        {integration.revenueImpact}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500">
                    Not yet activated. Configure in Shopify app settings to enable.
                  </p>
                )}
              </div>
            ))}
            <div className="mt-3 pt-3 border-t border-surface-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-surface-900">Total Upsell Revenue</p>
                <p className="text-xs text-surface-500">Across all active integrations</p>
              </div>
              <p className="text-xl font-bold text-green-600">$27,520</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
