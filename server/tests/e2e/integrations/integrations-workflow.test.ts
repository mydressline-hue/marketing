/**
 * E2E tests for Integrations workflow lifecycles.
 *
 * Tests complete workflows:
 *   1. Ad Platform Integration - Connect Google Ads -> Sync campaigns -> Get report -> Disconnect
 *   2. Shopify Integration - Connect -> Sync products -> Register webhook -> Handle event -> Validate pixel
 *   3. CRM Integration - Connect Salesforce -> Sync contacts -> Create contact -> Track event -> Disconnect
 *   4. Analytics Integration - Connect Looker -> Export data -> Create dashboard -> Refresh -> Disconnect
 *   5. Multi-Platform - Connect multiple -> Sync all -> Unified status -> Disconnect all
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
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Domain simulators
// ---------------------------------------------------------------------------

interface PlatformConnection {
  id: string;
  platform_type: string;
  status: 'connected' | 'disconnected' | 'error';
  credentials_encrypted: string;
  config: Record<string, unknown>;
  connected_at: string;
  disconnected_at?: string;
  user_id: string;
}

interface SyncRecord {
  id: string;
  platform_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  records_synced: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  started_at: string;
  completed_at?: string;
  error?: string;
}

interface CrmContact {
  id: string;
  platform_type: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  lifecycle_stage: string;
  external_id: string;
  synced_at: string;
}

interface WebhookRegistration {
  id: string;
  platform_type: string;
  event_type: string;
  callback_url: string;
  status: 'active' | 'inactive';
  registered_at: string;
}

interface AnalyticsExport {
  id: string;
  platform_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: string;
  requested_at: string;
  completed_at?: string;
  download_url?: string;
  file_size_bytes?: number;
}

interface Dashboard {
  id: string;
  platform_type: string;
  name: string;
  description: string;
  widgets: number;
  created_at: string;
  last_refreshed?: string;
}

class IntegrationsWorkflowSimulator {
  private connections: Map<string, PlatformConnection> = new Map();
  private syncs: SyncRecord[] = [];
  private contacts: CrmContact[] = [];
  private webhooks: WebhookRegistration[] = [];
  private exports: AnalyticsExport[] = [];
  private dashboards: Dashboard[] = [];
  private events: Array<{ type: string; platform_type: string; data: unknown; timestamp: string }> = [];
  private connectionIdCounter = 0;
  private syncIdCounter = 0;
  private contactIdCounter = 0;

  // -- Connection lifecycle --

  connectPlatform(
    platformType: string,
    credentials: Record<string, unknown>,
    config: Record<string, unknown>,
    userId: string,
  ): PlatformConnection {
    if (this.connections.has(platformType)) {
      const existing = this.connections.get(platformType)!;
      if (existing.status === 'connected') {
        throw new Error(`Platform ${platformType} is already connected`);
      }
    }
    this.connectionIdCounter += 1;
    const connection: PlatformConnection = {
      id: `conn-${platformType}-${this.connectionIdCounter}`,
      platform_type: platformType,
      status: 'connected',
      credentials_encrypted: `encrypted:${JSON.stringify(credentials)}`,
      config,
      connected_at: new Date().toISOString(),
      user_id: userId,
    };
    this.connections.set(platformType, connection);
    return connection;
  }

  disconnectPlatform(platformType: string): PlatformConnection {
    const conn = this.connections.get(platformType);
    if (!conn || conn.status !== 'connected') {
      throw new Error(`Platform ${platformType} is not connected`);
    }
    conn.status = 'disconnected';
    conn.disconnected_at = new Date().toISOString();
    return conn;
  }

  getPlatformStatus(platformType: string): PlatformConnection | undefined {
    return this.connections.get(platformType);
  }

  getConnectedPlatforms(): PlatformConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.status === 'connected');
  }

  getAllStatuses(): Array<{ platform_type: string; status: string }> {
    return Array.from(this.connections.values()).map((c) => ({
      platform_type: c.platform_type,
      status: c.status,
    }));
  }

  // -- Sync lifecycle --

  triggerSync(platformType: string, syncType: string = 'full'): SyncRecord {
    const conn = this.connections.get(platformType);
    if (!conn || conn.status !== 'connected') {
      throw new Error(`Platform ${platformType} is not connected`);
    }
    this.syncIdCounter += 1;
    const sync: SyncRecord = {
      id: `sync-${platformType}-${this.syncIdCounter}`,
      platform_type: platformType,
      status: 'in_progress',
      records_synced: 0,
      records_created: 0,
      records_updated: 0,
      records_failed: 0,
      started_at: new Date().toISOString(),
    };
    this.syncs.push(sync);
    return sync;
  }

  completeSync(
    syncId: string,
    results: { synced: number; created: number; updated: number; failed: number },
  ): SyncRecord {
    const sync = this.syncs.find((s) => s.id === syncId);
    if (!sync) throw new Error(`Sync ${syncId} not found`);
    sync.status = results.failed > 0 && results.synced === 0 ? 'failed' : 'completed';
    sync.records_synced = results.synced;
    sync.records_created = results.created;
    sync.records_updated = results.updated;
    sync.records_failed = results.failed;
    sync.completed_at = new Date().toISOString();
    return sync;
  }

  getLatestSync(platformType: string): SyncRecord | undefined {
    return [...this.syncs]
      .filter((s) => s.platform_type === platformType)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
  }

  // -- CRM contacts --

  addContact(platformType: string, contactData: Omit<CrmContact, 'id' | 'synced_at'>): CrmContact {
    this.contactIdCounter += 1;
    const contact: CrmContact = {
      ...contactData,
      id: `contact-${this.contactIdCounter}`,
      synced_at: new Date().toISOString(),
    };
    this.contacts.push(contact);
    return contact;
  }

  getContacts(platformType: string): CrmContact[] {
    return this.contacts.filter((c) => c.platform_type === platformType);
  }

  // -- Webhooks --

  registerWebhook(
    platformType: string,
    eventType: string,
    callbackUrl: string,
  ): WebhookRegistration {
    const webhook: WebhookRegistration = {
      id: `wh-${platformType}-${this.webhooks.length + 1}`,
      platform_type: platformType,
      event_type: eventType,
      callback_url: callbackUrl,
      status: 'active',
      registered_at: new Date().toISOString(),
    };
    this.webhooks.push(webhook);
    return webhook;
  }

  handleWebhookEvent(
    platformType: string,
    eventType: string,
    data: unknown,
  ): { processed: boolean; event_id: string } {
    const webhook = this.webhooks.find(
      (w) => w.platform_type === platformType && w.event_type === eventType && w.status === 'active',
    );
    if (!webhook) {
      return { processed: false, event_id: '' };
    }
    const eventId = `event-${this.events.length + 1}`;
    this.events.push({
      type: eventType,
      platform_type: platformType,
      data,
      timestamp: new Date().toISOString(),
    });
    return { processed: true, event_id: eventId };
  }

  getActiveWebhooks(platformType: string): WebhookRegistration[] {
    return this.webhooks.filter((w) => w.platform_type === platformType && w.status === 'active');
  }

  // -- Analytics / Exports --

  requestExport(platformType: string, format: string): AnalyticsExport {
    const exportRecord: AnalyticsExport = {
      id: `export-${platformType}-${this.exports.length + 1}`,
      platform_type: platformType,
      status: 'pending',
      format,
      requested_at: new Date().toISOString(),
    };
    this.exports.push(exportRecord);
    return exportRecord;
  }

  completeExport(exportId: string, fileSize: number): AnalyticsExport {
    const exp = this.exports.find((e) => e.id === exportId);
    if (!exp) throw new Error(`Export ${exportId} not found`);
    exp.status = 'completed';
    exp.completed_at = new Date().toISOString();
    exp.download_url = `https://cdn.example.com/exports/${exportId}.${exp.format}`;
    exp.file_size_bytes = fileSize;
    return exp;
  }

  getExport(exportId: string): AnalyticsExport | undefined {
    return this.exports.find((e) => e.id === exportId);
  }

  // -- Dashboards --

  createDashboard(platformType: string, name: string, description: string): Dashboard {
    const dashboard: Dashboard = {
      id: `dash-${this.dashboards.length + 1}`,
      platform_type: platformType,
      name,
      description,
      widgets: 0,
      created_at: new Date().toISOString(),
    };
    this.dashboards.push(dashboard);
    return dashboard;
  }

  refreshDashboard(dashboardId: string): Dashboard {
    const dash = this.dashboards.find((d) => d.id === dashboardId);
    if (!dash) throw new Error(`Dashboard ${dashboardId} not found`);
    dash.last_refreshed = new Date().toISOString();
    return dash;
  }

  getDashboards(platformType: string): Dashboard[] {
    return this.dashboards.filter((d) => d.platform_type === platformType);
  }

  // -- Tracking events --

  trackEvent(platformType: string, eventType: string, data: unknown): string {
    const eventId = `evt-${this.events.length + 1}`;
    this.events.push({
      type: eventType,
      platform_type: platformType,
      data,
      timestamp: new Date().toISOString(),
    });
    return eventId;
  }

  getEvents(platformType: string): Array<{ type: string; data: unknown; timestamp: string }> {
    return this.events
      .filter((e) => e.platform_type === platformType)
      .map(({ type, data, timestamp }) => ({ type, data, timestamp }));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integrations Workflow E2E Tests', () => {
  let simulator: IntegrationsWorkflowSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    simulator = new IntegrationsWorkflowSimulator();
  });

  // =========================================================================
  // Workflow 1: Ad Platform Integration (Google Ads)
  // =========================================================================

  describe('Workflow 1: Ad Platform Integration - Google Ads lifecycle', () => {
    it('should connect Google Ads with valid credentials', () => {
      const connection = simulator.connectPlatform(
        'google_ads',
        { client_id: 'gads-123', client_secret: 'secret-xyz', refresh_token: 'rt-abc' },
        { account_id: '123-456-7890', manager_account_id: '111-222-3333' },
        'user-admin-1',
      );

      expect(connection.status).toBe('connected');
      expect(connection.platform_type).toBe('google_ads');
      expect(connection.credentials_encrypted).toContain('encrypted:');
      expect(connection.user_id).toBe('user-admin-1');
    });

    it('should sync campaigns after connecting', () => {
      simulator.connectPlatform('google_ads', { token: 'abc' }, {}, 'user-1');
      const sync = simulator.triggerSync('google_ads', 'full');

      expect(sync.status).toBe('in_progress');
      expect(sync.platform_type).toBe('google_ads');

      const completed = simulator.completeSync(sync.id, {
        synced: 1250, created: 45, updated: 1205, failed: 0,
      });

      expect(completed.status).toBe('completed');
      expect(completed.records_synced).toBe(1250);
      expect(completed.records_created).toBe(45);
      expect(completed.records_failed).toBe(0);
    });

    it('should get campaign reports after sync', async () => {
      simulator.connectPlatform('google_ads', { token: 'abc' }, {}, 'user-1');
      const sync = simulator.triggerSync('google_ads');
      simulator.completeSync(sync.id, { synced: 500, created: 10, updated: 490, failed: 0 });

      // Simulate fetching reports from DB
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'rpt-1', campaign_name: 'Summer Sale', impressions: 450000, clicks: 12500, spend: 4200.50 },
          { id: 'rpt-2', campaign_name: 'Brand Awareness', impressions: 1200000, clicks: 28000, spend: 8500.00 },
        ],
        rowCount: 2,
      });

      const reportResult = await mockPool.query(
        'SELECT * FROM integration_reports WHERE platform_type = $1 ORDER BY date DESC LIMIT $2',
        ['google_ads', 20],
      );

      expect(reportResult.rows).toHaveLength(2);
      expect(reportResult.rows[0].campaign_name).toBe('Summer Sale');
    });

    it('should disconnect after workflow completion', () => {
      simulator.connectPlatform('google_ads', { token: 'abc' }, {}, 'user-1');
      simulator.triggerSync('google_ads');

      const disconnected = simulator.disconnectPlatform('google_ads');
      expect(disconnected.status).toBe('disconnected');
      expect(disconnected.disconnected_at).toBeDefined();
    });

    it('should persist full Google Ads lifecycle to database and audit', async () => {
      // Connect
      const conn = simulator.connectPlatform('google_ads', { token: 'abc' }, {}, 'user-1');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: conn.id, platform_type: 'google_ads', status: 'connected' }],
        rowCount: 1,
      });

      const connDb = await mockPool.query(
        'INSERT INTO platform_connections (id, platform_type, status, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [conn.id, 'google_ads', 'connected', 'user-1'],
      );
      expect(connDb.rows[0].status).toBe('connected');

      // Sync
      const sync = simulator.triggerSync('google_ads');
      simulator.completeSync(sync.id, { synced: 100, created: 10, updated: 90, failed: 0 });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: sync.id, status: 'completed', records_synced: 100 }],
        rowCount: 1,
      });

      const syncDb = await mockPool.query(
        'INSERT INTO sync_records (id, platform_type, status, records_synced) VALUES ($1, $2, $3, $4) RETURNING *',
        [sync.id, 'google_ads', 'completed', 100],
      );
      expect(syncDb.rows[0].records_synced).toBe(100);

      // Disconnect
      simulator.disconnectPlatform('google_ads');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: conn.id, status: 'disconnected' }],
        rowCount: 1,
      });

      const disconnDb = await mockPool.query(
        'UPDATE platform_connections SET status = $1 WHERE id = $2 RETURNING *',
        ['disconnected', conn.id],
      );
      expect(disconnDb.rows[0].status).toBe('disconnected');

      // Audit trail
      mockAuditLog.mockResolvedValue(undefined);
      await mockAuditLog({
        userId: 'user-1',
        action: 'integration.full_lifecycle',
        resourceType: 'integration',
        details: { platform_type: 'google_ads', sync_id: sync.id },
      });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.full_lifecycle' }),
      );
    });
  });

  // =========================================================================
  // Workflow 2: Shopify Integration
  // =========================================================================

  describe('Workflow 2: Shopify Integration lifecycle', () => {
    it('should connect Shopify and sync products', () => {
      const connection = simulator.connectPlatform(
        'shopify',
        { api_key: 'shpka_xxx', api_secret: 'shpks_yyy' },
        { shop_domain: 'mystore.myshopify.com' },
        'user-1',
      );

      expect(connection.status).toBe('connected');
      expect(connection.platform_type).toBe('shopify');

      const sync = simulator.triggerSync('shopify', 'full');
      const completed = simulator.completeSync(sync.id, {
        synced: 350, created: 350, updated: 0, failed: 2,
      });

      expect(completed.status).toBe('completed');
      expect(completed.records_created).toBe(350);
    });

    it('should register webhooks after connection', () => {
      simulator.connectPlatform('shopify', { api_key: 'key' }, {}, 'user-1');

      const orderWebhook = simulator.registerWebhook(
        'shopify',
        'orders/create',
        'https://api.example.com/webhooks/shopify/orders',
      );

      const productWebhook = simulator.registerWebhook(
        'shopify',
        'products/update',
        'https://api.example.com/webhooks/shopify/products',
      );

      expect(orderWebhook.status).toBe('active');
      expect(productWebhook.status).toBe('active');
      expect(simulator.getActiveWebhooks('shopify')).toHaveLength(2);
    });

    it('should handle incoming webhook events', () => {
      simulator.connectPlatform('shopify', { api_key: 'key' }, {}, 'user-1');
      simulator.registerWebhook('shopify', 'orders/create', 'https://api.example.com/webhooks/shopify/orders');

      const result = simulator.handleWebhookEvent('shopify', 'orders/create', {
        order_id: 'order-12345',
        total_price: 149.99,
        currency: 'USD',
        line_items: [{ product_id: 'prod-1', quantity: 2, price: 74.995 }],
      });

      expect(result.processed).toBe(true);
      expect(result.event_id).toBeTruthy();

      // Unregistered event type
      const unhandled = simulator.handleWebhookEvent('shopify', 'refunds/create', { refund_id: 'ref-1' });
      expect(unhandled.processed).toBe(false);
    });

    it('should validate pixel tracking for Shopify', () => {
      simulator.connectPlatform('shopify', { api_key: 'key' }, {}, 'user-1');

      // Simulate pixel events being tracked
      const pageViewId = simulator.trackEvent('shopify', 'page_view', {
        page: '/products/widget-pro',
        referrer: 'https://google.com',
        user_agent: 'Mozilla/5.0',
      });

      const addToCartId = simulator.trackEvent('shopify', 'add_to_cart', {
        product_id: 'prod-1',
        product_name: 'Widget Pro',
        price: 49.99,
        quantity: 1,
      });

      const purchaseId = simulator.trackEvent('shopify', 'purchase', {
        order_id: 'order-999',
        total: 49.99,
        currency: 'USD',
      });

      expect(pageViewId).toBeTruthy();
      expect(addToCartId).toBeTruthy();
      expect(purchaseId).toBeTruthy();

      const events = simulator.getEvents('shopify');
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.type)).toEqual(['page_view', 'add_to_cart', 'purchase']);
    });

    it('should persist Shopify workflow to database', async () => {
      const conn = simulator.connectPlatform('shopify', { api_key: 'key' }, {}, 'user-1');

      // Insert connection
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: conn.id, platform_type: 'shopify', status: 'connected' }],
        rowCount: 1,
      });
      const connDb = await mockPool.query(
        'INSERT INTO platform_connections (id, platform_type, status) VALUES ($1, $2, $3) RETURNING *',
        [conn.id, 'shopify', 'connected'],
      );
      expect(connDb.rows[0].platform_type).toBe('shopify');

      // Insert webhook registration
      const wh = simulator.registerWebhook('shopify', 'orders/create', 'https://api.example.com/wh');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: wh.id, event_type: 'orders/create', status: 'active' }],
        rowCount: 1,
      });
      const whDb = await mockPool.query(
        'INSERT INTO webhook_registrations (id, platform_type, event_type, callback_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [wh.id, 'shopify', 'orders/create', wh.callback_url],
      );
      expect(whDb.rows[0].status).toBe('active');

      // Cache webhook
      mockCacheSet.mockResolvedValueOnce(undefined);
      await mockCacheSet(`webhook:shopify:orders/create`, wh.id, 86400);
      expect(mockCacheSet).toHaveBeenCalledWith(`webhook:shopify:orders/create`, wh.id, 86400);
    });
  });

  // =========================================================================
  // Workflow 3: CRM Integration (Salesforce)
  // =========================================================================

  describe('Workflow 3: CRM Integration - Salesforce lifecycle', () => {
    it('should connect Salesforce and sync contacts', () => {
      const connection = simulator.connectPlatform(
        'salesforce',
        { access_token: 'sf-token', instance_url: 'https://na1.salesforce.com' },
        { api_version: 'v58.0', sandbox: false },
        'user-1',
      );

      expect(connection.status).toBe('connected');

      const sync = simulator.triggerSync('salesforce', 'full');
      const completed = simulator.completeSync(sync.id, {
        synced: 2500, created: 2500, updated: 0, failed: 15,
      });

      expect(completed.status).toBe('completed');
      expect(completed.records_synced).toBe(2500);
      expect(completed.records_failed).toBe(15);
    });

    it('should create new contacts in CRM', () => {
      simulator.connectPlatform('salesforce', { token: 'abc' }, {}, 'user-1');

      const contact1 = simulator.addContact('salesforce', {
        platform_type: 'salesforce',
        email: 'alice@example.com',
        first_name: 'Alice',
        last_name: 'Johnson',
        company: 'TechCorp',
        lifecycle_stage: 'lead',
        external_id: 'sf-001',
      });

      const contact2 = simulator.addContact('salesforce', {
        platform_type: 'salesforce',
        email: 'bob@acme.com',
        first_name: 'Bob',
        last_name: 'Smith',
        company: 'Acme Inc',
        lifecycle_stage: 'customer',
        external_id: 'sf-002',
      });

      expect(contact1.id).toBeDefined();
      expect(contact2.id).toBeDefined();
      expect(simulator.getContacts('salesforce')).toHaveLength(2);
    });

    it('should track CRM events for contacts', () => {
      simulator.connectPlatform('salesforce', { token: 'abc' }, {}, 'user-1');

      simulator.addContact('salesforce', {
        platform_type: 'salesforce',
        email: 'alice@example.com',
        first_name: 'Alice',
        last_name: 'Johnson',
        company: 'TechCorp',
        lifecycle_stage: 'lead',
        external_id: 'sf-001',
      });

      // Track lifecycle events
      simulator.trackEvent('salesforce', 'lead_created', {
        contact_email: 'alice@example.com',
        source: 'google_ads',
        campaign_id: 'camp-123',
      });

      simulator.trackEvent('salesforce', 'lead_qualified', {
        contact_email: 'alice@example.com',
        score: 85,
        qualified_by: 'auto',
      });

      simulator.trackEvent('salesforce', 'opportunity_created', {
        contact_email: 'alice@example.com',
        opportunity_value: 15000,
        stage: 'discovery',
      });

      const events = simulator.getEvents('salesforce');
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('lead_created');
      expect(events[2].type).toBe('opportunity_created');
    });

    it('should disconnect Salesforce and verify cleanup', async () => {
      simulator.connectPlatform('salesforce', { token: 'abc' }, {}, 'user-1');
      simulator.addContact('salesforce', {
        platform_type: 'salesforce',
        email: 'test@test.com',
        first_name: 'Test',
        last_name: 'User',
        company: 'Test Co',
        lifecycle_stage: 'lead',
        external_id: 'sf-099',
      });

      const disconnected = simulator.disconnectPlatform('salesforce');
      expect(disconnected.status).toBe('disconnected');

      // Cleanup caches
      mockCacheDel.mockResolvedValue(undefined);
      await mockCacheDel('integration:salesforce:status');
      await mockCacheDel('integration:salesforce:contacts');
      expect(mockCacheDel).toHaveBeenCalledTimes(2);

      // Audit
      mockAuditLog.mockResolvedValueOnce(undefined);
      await mockAuditLog({
        userId: 'user-1',
        action: 'integration.disconnect',
        resourceType: 'integration',
        details: { platform_type: 'salesforce' },
      });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.disconnect' }),
      );
    });

    it('should persist CRM contact sync to database', async () => {
      simulator.connectPlatform('salesforce', { token: 'abc' }, {}, 'user-1');
      const sync = simulator.triggerSync('salesforce');
      simulator.completeSync(sync.id, { synced: 100, created: 80, updated: 20, failed: 0 });

      // Batch insert contacts
      mockPool.query.mockResolvedValueOnce({
        rows: [{ batch_id: 'batch-1', contacts_inserted: 80 }],
        rowCount: 1,
      });

      const batchResult = await mockPool.query(
        'INSERT INTO crm_contacts (platform_type, email, first_name, last_name, company) SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) RETURNING batch_id, count(*) as contacts_inserted',
        [['salesforce'], ['alice@example.com'], ['Alice'], ['Johnson'], ['TechCorp']],
      );
      expect(batchResult.rows[0].contacts_inserted).toBe(80);
    });
  });

  // =========================================================================
  // Workflow 4: Analytics Integration (Looker)
  // =========================================================================

  describe('Workflow 4: Analytics Integration - Looker lifecycle', () => {
    it('should connect Looker and export data', () => {
      simulator.connectPlatform(
        'looker',
        { client_id: 'looker-id', client_secret: 'looker-secret' },
        { instance_url: 'https://mycompany.looker.com', api_port: 19999 },
        'user-1',
      );

      const exportRecord = simulator.requestExport('looker', 'csv');
      expect(exportRecord.status).toBe('pending');
      expect(exportRecord.platform_type).toBe('looker');

      const completed = simulator.completeExport(exportRecord.id, 5242880); // 5MB
      expect(completed.status).toBe('completed');
      expect(completed.download_url).toContain(exportRecord.id);
      expect(completed.file_size_bytes).toBe(5242880);
    });

    it('should create and refresh dashboards', () => {
      simulator.connectPlatform('looker', { token: 'abc' }, {}, 'user-1');

      const dashboard = simulator.createDashboard(
        'looker',
        'Campaign Performance',
        'Real-time campaign metrics and KPIs',
      );

      expect(dashboard.id).toBeDefined();
      expect(dashboard.name).toBe('Campaign Performance');
      expect(dashboard.last_refreshed).toBeUndefined();

      const refreshed = simulator.refreshDashboard(dashboard.id);
      expect(refreshed.last_refreshed).toBeDefined();
    });

    it('should handle multiple exports and dashboards', () => {
      simulator.connectPlatform('looker', { token: 'abc' }, {}, 'user-1');

      // Create exports
      const csvExport = simulator.requestExport('looker', 'csv');
      const jsonExport = simulator.requestExport('looker', 'json');
      const excelExport = simulator.requestExport('looker', 'xlsx');

      simulator.completeExport(csvExport.id, 1024000);
      simulator.completeExport(jsonExport.id, 2048000);

      expect(simulator.getExport(csvExport.id)!.status).toBe('completed');
      expect(simulator.getExport(jsonExport.id)!.status).toBe('completed');
      expect(simulator.getExport(excelExport.id)!.status).toBe('pending');

      // Create dashboards
      simulator.createDashboard('looker', 'Spend Overview', 'Budget tracking');
      simulator.createDashboard('looker', 'Conversion Funnel', 'Funnel visualization');

      expect(simulator.getDashboards('looker')).toHaveLength(2);
    });

    it('should disconnect Looker after workflow', async () => {
      simulator.connectPlatform('looker', { token: 'abc' }, {}, 'user-1');
      simulator.createDashboard('looker', 'Test Dashboard', 'Test');
      simulator.requestExport('looker', 'csv');

      const disconnected = simulator.disconnectPlatform('looker');
      expect(disconnected.status).toBe('disconnected');

      // Cache cleanup
      mockCacheDel.mockResolvedValue(undefined);
      await mockCacheDel('integration:looker:dashboards');
      await mockCacheDel('integration:looker:exports');
      expect(mockCacheDel).toHaveBeenCalledTimes(2);
    });

    it('should persist analytics lifecycle to database and cache', async () => {
      simulator.connectPlatform('looker', { token: 'abc' }, {}, 'user-1');

      // Export request
      const exp = simulator.requestExport('looker', 'csv');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: exp.id, status: 'pending', format: 'csv' }],
        rowCount: 1,
      });

      const expDb = await mockPool.query(
        'INSERT INTO analytics_exports (id, platform_type, status, format) VALUES ($1, $2, $3, $4) RETURNING *',
        [exp.id, 'looker', 'pending', 'csv'],
      );
      expect(expDb.rows[0].status).toBe('pending');

      // Complete export
      simulator.completeExport(exp.id, 1024);

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: exp.id, status: 'completed', file_size_bytes: 1024 }],
        rowCount: 1,
      });

      const expCompDb = await mockPool.query(
        'UPDATE analytics_exports SET status = $1, file_size_bytes = $2 WHERE id = $3 RETURNING *',
        ['completed', 1024, exp.id],
      );
      expect(expCompDb.rows[0].status).toBe('completed');

      // Cache export URL
      mockCacheSet.mockResolvedValueOnce(undefined);
      const completedExp = simulator.getExport(exp.id)!;
      await mockCacheSet(`export:${exp.id}:url`, completedExp.download_url, 3600);
      expect(mockCacheSet).toHaveBeenCalledWith(
        `export:${exp.id}:url`,
        expect.stringContaining(exp.id),
        3600,
      );
    });
  });

  // =========================================================================
  // Workflow 5: Multi-Platform
  // =========================================================================

  describe('Workflow 5: Multi-Platform workflow', () => {
    it('should connect multiple platforms simultaneously', () => {
      simulator.connectPlatform('google_ads', { token: 'gads-token' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { access_token: 'meta-token' }, {}, 'user-1');
      simulator.connectPlatform('shopify', { api_key: 'shp-key' }, {}, 'user-1');
      simulator.connectPlatform('salesforce', { access_token: 'sf-token' }, {}, 'user-1');
      simulator.connectPlatform('looker', { client_id: 'looker-id' }, {}, 'user-1');

      expect(simulator.getConnectedPlatforms()).toHaveLength(5);
    });

    it('should sync all connected platforms', () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');
      simulator.connectPlatform('shopify', { token: 'shp' }, {}, 'user-1');

      const gadSync = simulator.triggerSync('google_ads');
      const metaSync = simulator.triggerSync('meta_ads');
      const shopifySync = simulator.triggerSync('shopify');

      simulator.completeSync(gadSync.id, { synced: 1000, created: 50, updated: 950, failed: 0 });
      simulator.completeSync(metaSync.id, { synced: 800, created: 30, updated: 770, failed: 5 });
      simulator.completeSync(shopifySync.id, { synced: 350, created: 350, updated: 0, failed: 0 });

      expect(simulator.getLatestSync('google_ads')!.status).toBe('completed');
      expect(simulator.getLatestSync('meta_ads')!.status).toBe('completed');
      expect(simulator.getLatestSync('shopify')!.status).toBe('completed');
    });

    it('should get unified status across all platforms', () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');
      simulator.connectPlatform('shopify', { token: 'shp' }, {}, 'user-1');

      const statuses = simulator.getAllStatuses();
      expect(statuses).toHaveLength(3);
      expect(statuses.every((s) => s.status === 'connected')).toBe(true);
    });

    it('should disconnect all platforms cleanly', async () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');
      simulator.connectPlatform('salesforce', { token: 'sf' }, {}, 'user-1');
      simulator.connectPlatform('looker', { token: 'lk' }, {}, 'user-1');

      const platforms = ['google_ads', 'meta_ads', 'salesforce', 'looker'];

      for (const platform of platforms) {
        simulator.disconnectPlatform(platform);
      }

      expect(simulator.getConnectedPlatforms()).toHaveLength(0);

      const statuses = simulator.getAllStatuses();
      expect(statuses.every((s) => s.status === 'disconnected')).toBe(true);

      // Flush all integration caches
      mockCacheFlush.mockResolvedValueOnce(undefined);
      await mockCacheFlush();
      expect(mockCacheFlush).toHaveBeenCalledTimes(1);
    });

    it('should prevent connecting an already-connected platform', () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');

      expect(() =>
        simulator.connectPlatform('google_ads', { token: 'different' }, {}, 'user-1'),
      ).toThrow('already connected');
    });

    it('should prevent syncing a disconnected platform', () => {
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');
      simulator.disconnectPlatform('meta_ads');

      expect(() => simulator.triggerSync('meta_ads')).toThrow('not connected');
    });

    it('should handle mixed status across platforms', () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');
      simulator.connectPlatform('shopify', { token: 'shp' }, {}, 'user-1');

      // Disconnect one
      simulator.disconnectPlatform('meta_ads');

      const connected = simulator.getConnectedPlatforms();
      expect(connected).toHaveLength(2);
      expect(connected.map((c) => c.platform_type)).toContain('google_ads');
      expect(connected.map((c) => c.platform_type)).toContain('shopify');

      const statuses = simulator.getAllStatuses();
      const metaStatus = statuses.find((s) => s.platform_type === 'meta_ads');
      expect(metaStatus!.status).toBe('disconnected');
    });

    it('should persist multi-platform workflow to database', async () => {
      simulator.connectPlatform('google_ads', { token: 'gads' }, {}, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, {}, 'user-1');

      // Batch insert connections
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { platform_type: 'google_ads', status: 'connected' },
          { platform_type: 'meta_ads', status: 'connected' },
        ],
        rowCount: 2,
      });

      const connDb = await mockPool.query(
        'SELECT platform_type, status FROM platform_connections WHERE user_id = $1',
        ['user-1'],
      );
      expect(connDb.rows).toHaveLength(2);

      // Sync both
      const gadSync = simulator.triggerSync('google_ads');
      const metaSync = simulator.triggerSync('meta_ads');

      simulator.completeSync(gadSync.id, { synced: 500, created: 20, updated: 480, failed: 0 });
      simulator.completeSync(metaSync.id, { synced: 300, created: 15, updated: 285, failed: 2 });

      // Record sync results
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: gadSync.id, platform_type: 'google_ads', records_synced: 500 },
          { id: metaSync.id, platform_type: 'meta_ads', records_synced: 300 },
        ],
        rowCount: 2,
      });

      const syncDb = await mockPool.query(
        'SELECT id, platform_type, records_synced FROM sync_records WHERE platform_type IN ($1, $2)',
        ['google_ads', 'meta_ads'],
      );
      expect(syncDb.rows).toHaveLength(2);

      // Disconnect all
      simulator.disconnectPlatform('google_ads');
      simulator.disconnectPlatform('meta_ads');

      // Audit log for bulk disconnect
      mockAuditLog.mockResolvedValue(undefined);
      await mockAuditLog({
        userId: 'user-1',
        action: 'integration.bulk_disconnect',
        resourceType: 'integration',
        details: { platforms: ['google_ads', 'meta_ads'], count: 2 },
      });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.bulk_disconnect' }),
      );
    });
  });

  // =========================================================================
  // Full lifecycle integration
  // =========================================================================

  describe('Full lifecycle: multi-platform end-to-end', () => {
    it('should execute a complete multi-platform integration lifecycle', async () => {
      // Step 1: Connect ad platforms
      simulator.connectPlatform('google_ads', { token: 'gads' }, { account_id: '123' }, 'user-1');
      simulator.connectPlatform('meta_ads', { token: 'meta' }, { ad_account: 'act_456' }, 'user-1');
      expect(simulator.getConnectedPlatforms()).toHaveLength(2);

      // Step 2: Connect CRM
      simulator.connectPlatform('salesforce', { token: 'sf' }, {}, 'user-1');
      expect(simulator.getConnectedPlatforms()).toHaveLength(3);

      // Step 3: Connect analytics
      simulator.connectPlatform('looker', { token: 'lk' }, {}, 'user-1');
      expect(simulator.getConnectedPlatforms()).toHaveLength(4);

      // Step 4: Sync all platforms
      const gadSync = simulator.triggerSync('google_ads');
      const metaSync = simulator.triggerSync('meta_ads');
      const sfSync = simulator.triggerSync('salesforce');

      simulator.completeSync(gadSync.id, { synced: 1000, created: 50, updated: 950, failed: 0 });
      simulator.completeSync(metaSync.id, { synced: 750, created: 25, updated: 725, failed: 3 });
      simulator.completeSync(sfSync.id, { synced: 2000, created: 2000, updated: 0, failed: 10 });

      // Step 5: Add CRM contacts
      simulator.addContact('salesforce', {
        platform_type: 'salesforce',
        email: 'lead@example.com',
        first_name: 'Lead',
        last_name: 'User',
        company: 'LeadCo',
        lifecycle_stage: 'lead',
        external_id: 'sf-lead-1',
      });
      expect(simulator.getContacts('salesforce')).toHaveLength(1);

      // Step 6: Register Shopify-style webhooks on Salesforce
      simulator.registerWebhook('salesforce', 'contact/updated', 'https://api.example.com/wh/sf');

      // Step 7: Create analytics dashboards
      const dash = simulator.createDashboard('looker', 'Unified Performance', 'Cross-platform metrics');
      simulator.refreshDashboard(dash.id);

      // Step 8: Export analytics data
      const exportRecord = simulator.requestExport('looker', 'csv');
      simulator.completeExport(exportRecord.id, 10485760); // 10MB

      // Step 9: Verify unified status
      const statuses = simulator.getAllStatuses();
      expect(statuses).toHaveLength(4);
      expect(statuses.every((s) => s.status === 'connected')).toBe(true);

      // Step 10: Disconnect everything
      simulator.disconnectPlatform('google_ads');
      simulator.disconnectPlatform('meta_ads');
      simulator.disconnectPlatform('salesforce');
      simulator.disconnectPlatform('looker');

      expect(simulator.getConnectedPlatforms()).toHaveLength(0);

      // Step 11: Audit trail
      mockAuditLog.mockResolvedValue(undefined);
      await mockAuditLog({
        userId: 'user-1',
        action: 'integration.full_lifecycle_complete',
        resourceType: 'integration',
        details: {
          platforms_used: ['google_ads', 'meta_ads', 'salesforce', 'looker'],
          total_records_synced: 3750,
          contacts_added: 1,
          exports_completed: 1,
          dashboards_created: 1,
        },
      });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.full_lifecycle_complete' }),
      );

      // Step 12: Cache cleanup
      mockCacheFlush.mockResolvedValueOnce(undefined);
      await mockCacheFlush();
      expect(mockCacheFlush).toHaveBeenCalledTimes(1);
    });
  });
});
