import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createElement } from 'react';

vi.mock('../../src/hooks/useApi', () => ({
  useApiQuery: vi.fn(),
  useApiMutation: vi.fn(() => ({ mutate: vi.fn(), loading: false, error: null, data: null, reset: vi.fn() })),
}));
vi.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ connected: true, subscribe: vi.fn(() => vi.fn()), lastMessage: null, send: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), unsubscribe: vi.fn() })),
}));
vi.mock('../../src/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    sidebarOpen: true, darkMode: false, toggleSidebar: vi.fn(), toggleDarkMode: vi.fn(),
    autonomyMode: 'semi' as const, setAutonomyMode: vi.fn(),
    alerts: [], killSwitch: { global: false, campaigns: false, automation: false, apiKeys: false, countrySpecific: {} },
    setKillSwitch: vi.fn(), addAlert: vi.fn(), dismissAlert: vi.fn(),
    selectedCountry: null, setSelectedCountry: vi.fn(),
  })),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => createElement('div', null, children),
  AreaChart: ({ children }: any) => createElement('div', null, children),
  BarChart: ({ children }: any) => createElement('div', null, children),
  LineChart: ({ children }: any) => createElement('div', null, children),
  PieChart: ({ children }: any) => createElement('div', null, children),
  RadarChart: ({ children }: any) => createElement('div', null, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
  Funnel: () => null, FunnelChart: () => null,
}));
vi.mock('../../src/components/products/ProductsHub', () => ({
  default: () => createElement('div', { 'data-testid': 'products-hub-mock' }, 'ProductsHub'),
}));

import { useApiQuery } from '../../src/hooks/useApi';
import Shopify from '../../src/pages/Shopify';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockProducts = [
  { id: 'p1', title: 'Premium Headphones', sku: 'SKU-001', status: 'active', inventory: 245, variants: 3, synced: true, lastSync: '2 min ago' },
  { id: 'p2', title: 'Wireless Mouse', sku: 'SKU-002', status: 'active', inventory: 8, variants: 2, synced: true, lastSync: '5 min ago' },
];

const mockSyncStatus = {
  lastSync: '2 min ago',
  nextSync: 'In 13 minutes',
  syncHealth: 98,
  productsSynced: 156,
  inventoryAlerts: 3,
  blogPostsSynced: 42,
  pixelHealth: 95,
  blogStats: {
    published: 38,
    drafts: 4,
    failed: 1,
    seoSynced: 35,
    seoTotal: 42,
    localizedPosts: 24,
    languages: 6,
    failedReason: 'API timeout',
  },
  salesData: [
    { day: 'Jan 1', revenue: 8500, orders: 42 },
    { day: 'Jan 2', revenue: 9200, orders: 48 },
  ],
  conversionFunnel: [
    { funnel: 'Page Views', count: 15000 },
    { funnel: 'Add to Cart', count: 3200 },
    { funnel: 'Checkout', count: 1800 },
    { funnel: 'Purchase', count: 950 },
  ],
  pixelTracking: [
    { name: 'Meta Pixel', status: 'connected' as const, health: 'healthy' as const, detail: 'Tracking all events', eventsToday: 2450 },
    { name: 'Google Tag', status: 'connected' as const, health: 'warning' as const, detail: 'Missing purchase events', eventsToday: 1800 },
  ],
  inventoryAlertsList: [
    { id: 'ia-1', product: 'Wireless Mouse', sku: 'SKU-002', currentStock: 8, reorderPoint: 25, message: 'Stock below reorder point' },
  ],
  upsellIntegrations: [
    { name: 'Post-Purchase Upsell', status: 'active', conversionRate: 12.5, revenueImpact: '+$4.2K' },
    { name: 'In-Cart Cross-sell', status: 'inactive', conversionRate: 0, revenueImpact: '$0' },
  ],
  totalUpsellRevenue: '$12,450',
  kpiChanges: {
    productsSynced: 3,
    inventoryAlerts: -1,
    blogPostsSynced: 5,
    pixelHealth: 2,
  },
};

const mockWebhooks = [
  { topic: 'orders/create', endpoint: 'https://api.example.com/webhooks/orders', status: 'active', lastTriggered: '30 sec ago' },
  { topic: 'products/update', endpoint: 'https://api.example.com/webhooks/products', status: 'active', lastTriggered: '2 min ago' },
];

// Helper - Shopify uses 3 useApiQuery calls: products, syncStatus, webhooks
function setupMocks(overrides: {
  products?: { data: any; loading: boolean; error: any };
  sync?: { data: any; loading: boolean; error: any };
  webhooks?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.products })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.sync })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.webhooks });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(Shopify)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Shopify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when sync data is loading', () => {
    setupMocks({ sync: { data: null, loading: true, error: null } });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({ sync: { data: null, loading: true, error: null } });
    renderPage();
    expect(screen.getByText('Shopify Integration')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({ sync: { data: null, loading: true, error: null } });
    renderPage();
    expect(screen.getByText('Product Sync, Inventory Management & Conversion Tracking')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when sync data fails', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: null, loading: false, error: new Error('Sync failed') },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when sync data is loaded', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Products Synced')).toBeInTheDocument();
    expect(screen.getAllByText('Inventory Alerts').length).toBeGreaterThan(0);
    expect(screen.getByText('Blog Posts Synced')).toBeInTheDocument();
    expect(screen.getByText('Pixel Health')).toBeInTheDocument();
  });

  it('renders sync status card with last sync info', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Sync Status')).toBeInTheDocument();
    expect(screen.getByText('Manual Sync Now')).toBeInTheDocument();
  });

  it('renders blog and content sync card', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Blog & Content Sync')).toBeInTheDocument();
  });

  it('renders products hub section', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByTestId('products-hub-mock')).toBeInTheDocument();
  });

  it('renders inventory alerts section', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('Inventory Alerts').length).toBeGreaterThan(0);
    expect(screen.getByText('Stock below reorder point')).toBeInTheDocument();
  });

  it('renders pixel and conversion tracking section', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Pixel & Conversion Tracking')).toBeInTheDocument();
    expect(screen.getByText('Meta Pixel')).toBeInTheDocument();
    expect(screen.getByText('Google Tag')).toBeInTheDocument();
  });

  it('renders webhook status section', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Webhook Status')).toBeInTheDocument();
    expect(screen.getByText('orders/create')).toBeInTheDocument();
    expect(screen.getByText('products/update')).toBeInTheDocument();
  });

  it('renders upsell and funnel integrations', () => {
    setupMocks({
      products: { data: mockProducts, loading: false, error: null },
      sync: { data: mockSyncStatus, loading: false, error: null },
      webhooks: { data: mockWebhooks, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Upsell & Funnel Integrations')).toBeInTheDocument();
    expect(screen.getByText('Post-Purchase Upsell')).toBeInTheDocument();
  });
});
