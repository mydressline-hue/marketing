/**
 * Unit tests for DataEngineeringAgent (Agent 17).
 *
 * All external dependencies (database, Redis, AI client, logger) are mocked
 * so that we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports so jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
    ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-de-001'),
  retryWithBackoff: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { DataEngineeringAgent } from '../../../src/agents/modules/DataEngineeringAgent';
import type {
  EventValidation,
  TrackingConfig,
  PipelineStatus,
  DataQualityReport,
  FreshnessReport,
  DataAnomaly,
  NormalizationResult,
  DataLineage,
} from '../../../src/agents/modules/DataEngineeringAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

// Typed mocks
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('DataEngineeringAgent', () => {
  let agent: DataEngineeringAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new DataEngineeringAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('creates an agent with correct default configuration', () => {
      const config = agent.getConfig();
      expect(config.agentType).toBe('data_engineering');
      expect(config.model).toBe('sonnet');
      expect(config.maxRetries).toBe(3);
      expect(config.timeoutMs).toBe(90_000);
      expect(config.confidenceThreshold).toBe(60);
    });

    it('accepts custom configuration overrides', () => {
      const custom = new DataEngineeringAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 80,
      });
      const config = custom.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(60_000);
      expect(config.confidenceThreshold).toBe(80);
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toContain('performance_analytics');
      expect(targets).toContain('shopify_integration');
      expect(targets).toContain('enterprise_security');
      expect(targets).toHaveLength(3);
    });

    it('returns a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Data Engineering');
    });
  });

  // -----------------------------------------------------------------------
  // validateEventTracking
  // -----------------------------------------------------------------------

  describe('validateEventTracking', () => {
    it('validates correctly formatted event names', async () => {
      const events = ['page_view', 'add_to_cart', 'checkout_complete'];
      const result: EventValidation = await agent.validateEventTracking(events);

      expect(result.events).toHaveLength(3);
      expect(result.events.every((e) => e.valid)).toBe(true);
      expect(result.overallHealth).toBe(100);
    });

    it('rejects event names that violate naming conventions', async () => {
      const events = ['PageView', 'ab', '', 'test_event', '__invalid'];
      const result: EventValidation = await agent.validateEventTracking(events);

      expect(result.overallHealth).toBeLessThan(100);

      // 'PageView' should fail snake_case check
      const pageView = result.events.find((e) => e.name === 'PageView');
      expect(pageView?.valid).toBe(false);
      expect(pageView?.issues.length).toBeGreaterThan(0);

      // 'ab' should fail minimum length check
      const ab = result.events.find((e) => e.name === 'ab');
      expect(ab?.valid).toBe(false);

      // empty string should fail
      const empty = result.events.find((e) => e.name === '');
      expect(empty?.valid).toBe(false);

      // 'test_event' uses reserved prefix
      const testEvent = result.events.find((e) => e.name === 'test_event');
      expect(testEvent?.valid).toBe(false);
      expect(testEvent?.issues.some((i) => i.includes('reserved prefix'))).toBe(true);
    });

    it('returns 0 overall health for an empty event list', async () => {
      const result: EventValidation = await agent.validateEventTracking([]);
      expect(result.events).toHaveLength(0);
      expect(result.overallHealth).toBe(0);
    });

    it('detects consecutive underscores in event names', async () => {
      const result = await agent.validateEventTracking(['page__view']);
      expect(result.events[0].valid).toBe(false);
      expect(result.events[0].issues.some((i) => i.includes('consecutive underscores'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // setupServerSideTracking
  // -----------------------------------------------------------------------

  describe('setupServerSideTracking', () => {
    it('successfully configures tracking with valid config', async () => {
      // Mock DB call for connectivity test
      mockQuery.mockResolvedValue({ rows: [{ id: 'test-state' }] });

      const config: TrackingConfig = {
        provider: 'segment',
        events: ['page_view', 'purchase_complete'],
        serverUrl: 'https://tracking.example.com',
        apiKey: 'sk-test-key',
      };

      const result = await agent.setupServerSideTracking(config);

      expect(result.configured).toBe(true);
      expect(result.endpoints.length).toBe(2);
      expect(result.endpoints[0]).toContain('page_view');
      expect(Object.values(result.testResults).every((v) => v === true)).toBe(true);
    });

    it('fails when serverUrl is missing', async () => {
      const config: TrackingConfig = {
        provider: 'segment',
        events: ['page_view'],
        serverUrl: '',
        apiKey: 'sk-test-key',
      };

      const result = await agent.setupServerSideTracking(config);
      expect(result.configured).toBe(false);
      expect(result.endpoints).toHaveLength(0);
    });

    it('fails when all events are invalid', async () => {
      const config: TrackingConfig = {
        provider: 'segment',
        events: ['INVALID', ''],
        serverUrl: 'https://tracking.example.com',
        apiKey: 'sk-test-key',
      };

      const result = await agent.setupServerSideTracking(config);
      expect(result.configured).toBe(false);
      expect(result.testResults.event_validation).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // monitorPipelines
  // -----------------------------------------------------------------------

  describe('monitorPipelines', () => {
    it('returns healthy status for pipelines with good metrics', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          metrics: { recordsProcessed: 5000, errors: 0, latency: 500 },
          updated_at: new Date().toISOString(),
          status: 'running',
        }],
      });

      const result: PipelineStatus[] = await agent.monitorPipelines();

      expect(result.length).toBeGreaterThan(0);
      const healthyPipelines = result.filter((p) => p.status === 'healthy');
      expect(healthyPipelines.length).toBeGreaterThan(0);
      expect(healthyPipelines[0].recordsProcessed).toBe(5000);
      expect(healthyPipelines[0].errors).toBe(0);
    });

    it('returns failed status for pipelines with error state', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          metrics: { recordsProcessed: 0, errors: 200, latency: 0 },
          updated_at: new Date().toISOString(),
          status: 'error',
        }],
      });

      const result: PipelineStatus[] = await agent.monitorPipelines();

      const failedPipelines = result.filter((p) => p.status === 'failed');
      expect(failedPipelines.length).toBeGreaterThan(0);
    });

    it('returns degraded status when no state record exists', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result: PipelineStatus[] = await agent.monitorPipelines();

      expect(result.length).toBeGreaterThan(0);
      const degradedPipelines = result.filter((p) => p.status === 'degraded');
      expect(degradedPipelines.length).toBeGreaterThan(0);
    });

    it('uses cached pipeline status when available', async () => {
      const cachedStatus: PipelineStatus[] = [{
        name: 'cached_pipeline',
        status: 'healthy',
        lastRun: new Date().toISOString(),
        recordsProcessed: 100,
        errors: 0,
        latency: 50,
      }];
      mockCacheGet.mockResolvedValueOnce(cachedStatus);

      const result = await agent.monitorPipelines();

      expect(result).toEqual(cachedStatus);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // validateDataQuality
  // -----------------------------------------------------------------------

  describe('validateDataQuality', () => {
    it('returns quality report for a table with data', async () => {
      // Row count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1000' }] });

      // Column info query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
          { column_name: 'name', data_type: 'text', is_nullable: 'YES' },
          { column_name: 'score', data_type: 'integer', is_nullable: 'YES' },
        ],
      });

      // Null count queries (one per column)
      mockQuery.mockResolvedValueOnce({ rows: [{ null_count: '0' }] });   // id
      mockQuery.mockResolvedValueOnce({ rows: [{ null_count: '50' }] });  // name (5%)
      mockQuery.mockResolvedValueOnce({ rows: [{ null_count: '10' }] });  // score (1%)

      // Duplicate detection query
      mockQuery.mockResolvedValueOnce({ rows: [{ dup_count: '5' }] });

      // Outlier detection: stats for 'score' column
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_val: '50', stddev_val: '10' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ outlier_count: '3' }] });

      const result: DataQualityReport = await agent.validateDataQuality('campaigns');

      expect(result.table).toBe('campaigns');
      expect(result.totalRows).toBe(1000);
      expect(result.duplicates).toBe(5);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(Object.keys(result.nullPercentage)).toContain('id');
    });

    it('returns zero score for empty tables', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result: DataQualityReport = await agent.validateDataQuality('empty_table');

      expect(result.totalRows).toBe(0);
      expect(result.overallScore).toBe(0);
      expect(result.issues).toContain('Table is empty. No data quality assessment possible.');
    });

    it('throws when table cannot be accessed', async () => {
      mockQuery.mockRejectedValueOnce(new Error('relation "nonexistent" does not exist'));

      await expect(agent.validateDataQuality('nonexistent')).rejects.toThrow(
        /Unable to access table/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // checkDataFreshness
  // -----------------------------------------------------------------------

  describe('checkDataFreshness', () => {
    it('identifies stale tables based on staleness thresholds', async () => {
      const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
      const freshDate = new Date().toISOString(); // now

      // Each MONITORED_TABLE gets a query
      mockQuery
        .mockResolvedValueOnce({ rows: [{ last_updated: staleDate }] })  // campaigns (24h max)
        .mockResolvedValueOnce({ rows: [{ last_updated: freshDate }] })  // countries (168h max)
        .mockResolvedValueOnce({ rows: [{ last_updated: freshDate }] })  // agent_decisions
        .mockResolvedValueOnce({ rows: [{ last_updated: freshDate }] })  // agent_states
        .mockResolvedValueOnce({ rows: [{ last_updated: freshDate }] }); // audit_logs

      const result: FreshnessReport = await agent.checkDataFreshness();

      expect(result.tables.length).toBeGreaterThan(0);

      const campaignEntry = result.tables.find((t) => t.name === 'campaigns');
      expect(campaignEntry?.stale).toBe(true);

      const countriesEntry = result.tables.find((t) => t.name === 'countries');
      expect(countriesEntry?.stale).toBe(false);
    });

    it('marks tables as stale when no data exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ last_updated: null }] });

      const result: FreshnessReport = await agent.checkDataFreshness();

      for (const table of result.tables) {
        expect(table.stale).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // normalizeData
  // -----------------------------------------------------------------------

  describe('normalizeData', () => {
    it('returns empty result for empty data array', async () => {
      const result: NormalizationResult = await agent.normalizeData('shopify', []);

      expect(result.records).toBe(0);
      expect(result.transformed).toBe(0);
      expect(result.errors).toBe(0);
      expect(Object.keys(result.mapping)).toHaveLength(0);
    });

    it('normalizes data using AI-derived field mapping when available', async () => {
      // Mock the AI call inside deriveFieldMapping via callAI
      // Since callAI is protected and uses dynamic import, we mock at a higher level
      // The retryWithBackoff mock will call the fn directly
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockResolvedValueOnce(
        JSON.stringify({ productName: 'product_name', unitPrice: 'unit_price' }),
      );

      const data = [
        { productName: 'Widget', unitPrice: 9.99 },
        { productName: 'Gadget', unitPrice: 19.99 },
      ];

      const result: NormalizationResult = await agent.normalizeData('shopify', data);

      expect(result.records).toBe(2);
      expect(result.transformed).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.mapping).toHaveProperty('productName', 'product_name');

      mockCallAI.mockRestore();
    });

    it('falls back to identity mapping when AI fails', async () => {
      jest.spyOn(agent as any, 'callAI').mockRejectedValueOnce(new Error('AI unavailable'));

      const data = [{ myField: 'value' }];
      const result: NormalizationResult = await agent.normalizeData('csv', data);

      expect(result.records).toBe(1);
      expect(result.transformed).toBe(1);
      expect(result.mapping).toHaveProperty('myField');
    });
  });

  // -----------------------------------------------------------------------
  // detectDataAnomalies
  // -----------------------------------------------------------------------

  describe('detectDataAnomalies', () => {
    it('detects extreme values in numeric columns', async () => {
      // Column info
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'amount', data_type: 'numeric' },
        ],
      });

      // Stats query for 'amount'
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_val: '100', stddev_val: '10', min_val: '50', max_val: '500' }],
      });

      // Null burst count for 'amount'
      mockQuery.mockResolvedValueOnce({ rows: [{ null_count: '0' }] });
      // Total rows for null rate
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1000' }] });

      // Schema drift cache check (from cacheGet already returns null)
      // Schema drift cache set
      mockCacheSet.mockResolvedValue(undefined);

      const result: DataAnomaly[] = await agent.detectDataAnomalies('transactions');

      const extremeAnomalies = result.filter((a) => a.type === 'extreme_value');
      expect(extremeAnomalies.length).toBeGreaterThan(0);
      expect(extremeAnomalies[0].table).toBe('transactions');
      expect(extremeAnomalies[0].column).toBe('amount');
    });

    it('detects schema drift when column count changes', async () => {
      // Column info - returns 3 columns
      mockQuery.mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'uuid' },
          { column_name: 'name', data_type: 'text' },
          { column_name: 'score', data_type: 'text' },
        ],
      });

      // Previously cached column count was different
      mockCacheGet
        .mockResolvedValueOnce(null)  // pipeline status cache miss
        .mockResolvedValueOnce(5);    // schema cache returns 5 columns

      const result: DataAnomaly[] = await agent.detectDataAnomalies('test_table');

      const schemaDrift = result.filter((a) => a.type === 'schema_drift');
      expect(schemaDrift.length).toBe(1);
      expect(schemaDrift[0].severity).toBe('high');
      expect(schemaDrift[0].description).toContain('Column count changed from 5 to 3');
    });
  });

  // -----------------------------------------------------------------------
  // process (main entry point)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('completes assessment and returns structured output', async () => {
      // Mock all DB queries in sequence
      // monitorPipelines: 6 pipeline queries (one per KNOWN_PIPELINE)
      for (let i = 0; i < 6; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            metrics: { recordsProcessed: 100, errors: 0, latency: 200 },
            updated_at: new Date().toISOString(),
            status: 'running',
          }],
        });
      }

      // checkDataFreshness: 5 table freshness queries
      for (let i = 0; i < 5; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ last_updated: new Date().toISOString() }],
        });
      }

      // persistState: upsert query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // logDecision: insert query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = {
        context: {},
        parameters: {},
        requestId: 'test-req-001',
      };

      const output = await agent.process(input);

      expect(output.agentType).toBe('data_engineering');
      expect(output.decision).toBe('data_engineering_assessment_complete');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeTruthy();
      expect(output.timestamp).toBeTruthy();
      expect(output.data).toHaveProperty('pipelines');
      expect(output.data).toHaveProperty('freshnessReport');
    });

    it('includes warnings when pipelines are degraded', async () => {
      // monitorPipelines: return error state for all
      for (let i = 0; i < 6; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{
            metrics: { recordsProcessed: 0, errors: 500, latency: 0 },
            updated_at: new Date().toISOString(),
            status: 'error',
          }],
        });
      }

      // checkDataFreshness
      for (let i = 0; i < 5; i++) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ last_updated: new Date().toISOString() }],
        });
      }

      // persistState + logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // AI recommendation call (via callAI)
      jest.spyOn(agent as any, 'callAI').mockRejectedValueOnce(new Error('AI unavailable'));

      const input = {
        context: {},
        parameters: {},
        requestId: 'test-req-002',
      };

      const output = await agent.process(input);

      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.warnings.some((w) => w.includes('failed state'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // generateDataLineage
  // -----------------------------------------------------------------------

  describe('generateDataLineage', () => {
    it('generates lineage from foreign key relationships', async () => {
      // Foreign key sources query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { referenced_table: 'countries' },
          { referenced_table: 'users' },
        ],
      });

      // Reverse FK (downstream consumers)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: 'campaign_metrics' },
        ],
      });

      // Mock AI call for transformations
      jest.spyOn(agent as any, 'callAI').mockResolvedValueOnce(
        JSON.stringify(['Join with countries table', 'Filter active records']),
      );

      const result: DataLineage = await agent.generateDataLineage('campaigns');

      expect(result.table).toBe('campaigns');
      expect(result.sources).toContain('countries');
      expect(result.sources).toContain('users');
      expect(result.destinations).toContain('campaign_metrics');
      expect(result.transformations.length).toBeGreaterThan(0);
      expect(result.dependencies).toEqual(result.sources);
    });
  });
});
