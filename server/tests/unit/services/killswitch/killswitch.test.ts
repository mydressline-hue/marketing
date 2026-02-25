/**
 * Unit tests for KillSwitchService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic (activation,
 * deactivation, permission checks, caching, and audit logging).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('ks-uuid-new'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { KillSwitchService } from '../../../../src/services/killswitch/KillSwitchService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheFlush } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { generateId } from '../../../../src/utils/helpers';
import { logger } from '../../../../src/utils/logger';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockLogger = logger as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const KS_ID = 'ks-uuid-new';
const CAMPAIGN_ID = 'campaign-uuid-1';
const COUNTRY_ID = 'country-uuid-1';

function makeKsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: KS_ID,
    level: 1,
    is_active: true,
    activated_by: USER_ID,
    trigger_type: 'manual',
    trigger_details: { reason: 'test reason' },
    affected_countries: [],
    affected_campaigns: [],
    activated_at: '2026-02-25T00:00:00Z',
    deactivated_at: null,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KillSwitchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // activateGlobalKillSwitch
  // =========================================================================

  describe('activateGlobalKillSwitch', () => {
    it('activates kill switch at level 1', async () => {
      const row = makeKsRow({ level: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.activateGlobalKillSwitch(
        USER_ID,
        1,
        'Scaling pause',
      );

      expect(result.level).toBe(1);
      expect(result.is_active).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO kill_switch_state');
      expect(mockQuery.mock.calls[0][1]).toEqual([
        KS_ID,
        1,
        USER_ID,
        JSON.stringify({ reason: 'Scaling pause' }),
      ]);
    });

    it('activates kill switch at level 2', async () => {
      const row = makeKsRow({ level: 2 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.activateGlobalKillSwitch(
        USER_ID,
        2,
        'Pause new campaigns',
      );

      expect(result.level).toBe(2);
      expect(result.is_active).toBe(true);
    });

    it('activates kill switch at level 3', async () => {
      const row = makeKsRow({ level: 3 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.activateGlobalKillSwitch(
        USER_ID,
        3,
        'Country pause',
      );

      expect(result.level).toBe(3);
    });

    it('activates kill switch at level 4 (full shutdown)', async () => {
      const row = makeKsRow({ level: 4 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.activateGlobalKillSwitch(
        USER_ID,
        4,
        'Full shutdown',
      );

      expect(result.level).toBe(4);
      expect(result.is_active).toBe(true);
    });

    it('throws ValidationError for level 0', async () => {
      await expect(
        KillSwitchService.activateGlobalKillSwitch(USER_ID, 0 as never, 'Bad level'),
      ).rejects.toThrow(ValidationError);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('throws ValidationError for level above 4', async () => {
      await expect(
        KillSwitchService.activateGlobalKillSwitch(USER_ID, 5 as never, 'Bad level'),
      ).rejects.toThrow(ValidationError);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('invalidates cache on activation', async () => {
      const row = makeKsRow({ level: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.activateGlobalKillSwitch(USER_ID, 1, 'Cache test');

      expect(mockCacheFlush).toHaveBeenCalledWith('killswitch:*');
    });

    it('creates audit log on activation', async () => {
      const row = makeKsRow({ level: 2 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.activateGlobalKillSwitch(USER_ID, 2, 'Audit test');

      expect(mockAuditLog).toHaveBeenCalledWith({
        userId: USER_ID,
        action: 'kill_switch.activate',
        resourceType: 'kill_switch',
        resourceId: KS_ID,
        details: { level: 2, reason: 'Audit test' },
      });
    });

    it('logs warning on activation', async () => {
      const row = makeKsRow({ level: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.activateGlobalKillSwitch(USER_ID, 1, 'Log test');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Kill switch activated',
        expect.objectContaining({ level: 1, userId: USER_ID }),
      );
    });
  });

  // =========================================================================
  // deactivateKillSwitch
  // =========================================================================

  describe('deactivateKillSwitch', () => {
    it('deactivates an active kill switch entry', async () => {
      const row = makeKsRow({
        is_active: false,
        deactivated_at: '2026-02-25T01:00:00Z',
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.deactivateKillSwitch(KS_ID, USER_ID);

      expect(result.is_active).toBe(false);
      expect(result.deactivated_at).toBe('2026-02-25T01:00:00Z');
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = FALSE');
      expect(mockQuery.mock.calls[0][1]).toEqual([KS_ID]);
    });

    it('throws NotFoundError when kill switch entry does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        KillSwitchService.deactivateKillSwitch('nonexistent-id', USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it('invalidates cache on deactivation', async () => {
      const row = makeKsRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.deactivateKillSwitch(KS_ID, USER_ID);

      expect(mockCacheFlush).toHaveBeenCalledWith('killswitch:*');
    });

    it('creates audit log on deactivation', async () => {
      const row = makeKsRow({ is_active: false, level: 3 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.deactivateKillSwitch(KS_ID, USER_ID);

      expect(mockAuditLog).toHaveBeenCalledWith({
        userId: USER_ID,
        action: 'kill_switch.deactivate',
        resourceType: 'kill_switch',
        resourceId: KS_ID,
        details: { level: 3 },
      });
    });
  });

  // =========================================================================
  // getActiveKillSwitches
  // =========================================================================

  describe('getActiveKillSwitches', () => {
    it('returns active kill switches from DB when cache is empty', async () => {
      const rows = [makeKsRow({ level: 4 }), makeKsRow({ id: 'ks-uuid-2', level: 2 })];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await KillSwitchService.getActiveKillSwitches();

      expect(result).toHaveLength(2);
      expect(result[0].level).toBe(4);
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = TRUE');
    });

    it('returns cached result on cache hit', async () => {
      const cached = [makeKsRow({ level: 1 })];
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await KillSwitchService.getActiveKillSwitches();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches results with 30-second TTL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeKsRow()] });

      await KillSwitchService.getActiveKillSwitches();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:active',
        expect.any(Array),
        30,
      );
    });
  });

  // =========================================================================
  // getCurrentLevel
  // =========================================================================

  describe('getCurrentLevel', () => {
    it('returns highest active level from DB', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 3 }] });

      const level = await KillSwitchService.getCurrentLevel();

      expect(level).toBe(3);
    });

    it('returns 0 when no kill switches are active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 0 }] });

      const level = await KillSwitchService.getCurrentLevel();

      expect(level).toBe(0);
    });

    it('returns cached level on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(2);

      const level = await KillSwitchService.getCurrentLevel();

      expect(level).toBe(2);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches level with 10-second TTL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 1 }] });

      await KillSwitchService.getCurrentLevel();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:current_level',
        1,
        10,
      );
    });
  });

  // =========================================================================
  // pauseCampaign / resumeCampaign
  // =========================================================================

  describe('pauseCampaign', () => {
    it('creates a level-2 kill switch for a specific campaign', async () => {
      const row = makeKsRow({
        level: 2,
        affected_campaigns: [CAMPAIGN_ID],
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.pauseCampaign(
        CAMPAIGN_ID,
        USER_ID,
        'Budget exceeded',
      );

      expect(result.level).toBe(2);
      expect(result.affected_campaigns).toEqual([CAMPAIGN_ID]);
      expect(mockQuery.mock.calls[0][1]).toContain(JSON.stringify([CAMPAIGN_ID]));
    });

    it('logs audit entry for campaign pause', async () => {
      const row = makeKsRow({ level: 2, affected_campaigns: [CAMPAIGN_ID] });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.pauseCampaign(CAMPAIGN_ID, USER_ID, 'Pause reason');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kill_switch.pause_campaign',
          details: { campaignId: CAMPAIGN_ID, reason: 'Pause reason' },
        }),
      );
    });
  });

  describe('resumeCampaign', () => {
    it('deactivates kill switch for a specific campaign', async () => {
      const row = makeKsRow({
        is_active: false,
        affected_campaigns: [CAMPAIGN_ID],
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.resumeCampaign(CAMPAIGN_ID, USER_ID);

      expect(result.is_active).toBe(false);
      expect(mockQuery.mock.calls[0][0]).toContain('affected_campaigns @>');
    });

    it('throws NotFoundError when no active kill switch for campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        KillSwitchService.resumeCampaign(CAMPAIGN_ID, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it('logs audit entry for campaign resume', async () => {
      const row = makeKsRow({ is_active: false, affected_campaigns: [CAMPAIGN_ID] });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.resumeCampaign(CAMPAIGN_ID, USER_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kill_switch.resume_campaign',
          details: { campaignId: CAMPAIGN_ID },
        }),
      );
    });
  });

  // =========================================================================
  // pauseCountry / resumeCountry
  // =========================================================================

  describe('pauseCountry', () => {
    it('creates a level-3 kill switch for a specific country', async () => {
      const row = makeKsRow({
        level: 3,
        affected_countries: [COUNTRY_ID],
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.pauseCountry(
        COUNTRY_ID,
        USER_ID,
        'Regulation issue',
      );

      expect(result.level).toBe(3);
      expect(result.affected_countries).toEqual([COUNTRY_ID]);
    });

    it('invalidates cache on country pause', async () => {
      const row = makeKsRow({ level: 3, affected_countries: [COUNTRY_ID] });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.pauseCountry(COUNTRY_ID, USER_ID, 'Compliance');

      expect(mockCacheFlush).toHaveBeenCalledWith('killswitch:*');
    });
  });

  describe('resumeCountry', () => {
    it('deactivates kill switch for a specific country', async () => {
      const row = makeKsRow({
        is_active: false,
        affected_countries: [COUNTRY_ID],
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.resumeCountry(COUNTRY_ID, USER_ID);

      expect(result.is_active).toBe(false);
      expect(mockQuery.mock.calls[0][0]).toContain('affected_countries @>');
    });

    it('throws NotFoundError when no active kill switch for country', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        KillSwitchService.resumeCountry(COUNTRY_ID, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // pauseAutomation
  // =========================================================================

  describe('pauseAutomation', () => {
    it('creates a level-1 kill switch for automation', async () => {
      const row = makeKsRow({
        level: 1,
        trigger_details: { reason: 'Agent misbehaving', scope: 'automation' },
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.pauseAutomation(USER_ID, 'Agent misbehaving');

      expect(result.level).toBe(1);
      expect(mockQuery.mock.calls[0][1]).toContain(
        JSON.stringify({ reason: 'Agent misbehaving', scope: 'automation' }),
      );
    });

    it('logs audit entry for automation pause', async () => {
      const row = makeKsRow({ level: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.pauseAutomation(USER_ID, 'Safety measure');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kill_switch.pause_automation',
          details: { reason: 'Safety measure' },
        }),
      );
    });
  });

  // =========================================================================
  // lockAPIKeys
  // =========================================================================

  describe('lockAPIKeys', () => {
    it('creates a level-4 kill switch with API keys locked flag', async () => {
      const row = makeKsRow({
        level: 4,
        trigger_details: { reason: 'Security breach', api_keys_locked: true },
      });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await KillSwitchService.lockAPIKeys(USER_ID, 'Security breach');

      expect(result.level).toBe(4);
      expect(mockQuery.mock.calls[0][1]).toContain(
        JSON.stringify({ reason: 'Security breach', api_keys_locked: true }),
      );
    });

    it('logs audit entry with api_keys_locked detail', async () => {
      const row = makeKsRow({ level: 4 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await KillSwitchService.lockAPIKeys(USER_ID, 'Breach');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kill_switch.lock_api_keys',
          details: { reason: 'Breach', api_keys_locked: true },
        }),
      );
    });
  });

  // =========================================================================
  // isOperationAllowed
  // =========================================================================

  describe('isOperationAllowed', () => {
    it('allows all operations when level is 0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 0 }] });

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(true);
      expect(result.activeLevel).toBe(0);
      expect(result.reason).toBeUndefined();
    });

    it('blocks budget_increase at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(1);

      const result = await KillSwitchService.isOperationAllowed('budget_increase');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(1);
      expect(result.reason).toContain('budget increases are paused');
    });

    it('blocks campaign_scale at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(1);

      const result = await KillSwitchService.isOperationAllowed('campaign_scale');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(1);
    });

    it('allows campaign_create at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(1);

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(true);
      expect(result.activeLevel).toBe(1);
    });

    it('blocks campaign_create at level 2', async () => {
      mockCacheGet.mockResolvedValueOnce(2);

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(2);
      expect(result.reason).toContain('campaign creation is paused');
    });

    it('blocks agent_run at level 2', async () => {
      mockCacheGet.mockResolvedValueOnce(2);

      const result = await KillSwitchService.isOperationAllowed('agent_run');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(2);
    });

    it('allows api_call at level 2', async () => {
      mockCacheGet.mockResolvedValueOnce(2);

      const result = await KillSwitchService.isOperationAllowed('api_call');

      expect(result.allowed).toBe(true);
      expect(result.activeLevel).toBe(2);
    });

    it('blocks campaign_create at level 3', async () => {
      mockCacheGet.mockResolvedValueOnce(3);

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(3);
    });

    it('blocks all operations at level 4 (full shutdown)', async () => {
      mockCacheGet.mockResolvedValueOnce(4);

      const apiCall = await KillSwitchService.isOperationAllowed('api_call');
      expect(apiCall.allowed).toBe(false);
      expect(apiCall.reason).toContain('Full system shutdown');
      expect(apiCall.activeLevel).toBe(4);
    });

    it('blocks country-specific operations at level 3 when country matches', async () => {
      // getCurrentLevel returns 3
      mockCacheGet.mockResolvedValueOnce(3);
      // getActiveKillSwitches -- cache miss so queries DB
      mockCacheGet.mockResolvedValueOnce(null);
      const activeRows = [
        makeKsRow({ level: 3, affected_countries: [COUNTRY_ID] }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: activeRows });

      const result = await KillSwitchService.isOperationAllowed('api_call', {
        countryId: COUNTRY_ID,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(COUNTRY_ID);
    });
  });

  // =========================================================================
  // getKillSwitchHistory
  // =========================================================================

  describe('getKillSwitchHistory', () => {
    it('returns paginated history with default params', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeKsRow({ id: 'ks-1' }),
          makeKsRow({ id: 'ks-2', is_active: false }),
        ],
      });

      const result = await KillSwitchService.getKillSwitchHistory();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies trigger_type filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeKsRow()] });

      await KillSwitchService.getKillSwitchHistory({ triggerType: 'fraud_alert' });

      expect(mockQuery.mock.calls[0][0]).toContain('trigger_type = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('fraud_alert');
    });

    it('applies level filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeKsRow()] });

      await KillSwitchService.getKillSwitchHistory({ level: 4 });

      expect(mockQuery.mock.calls[0][0]).toContain('level = $1');
      expect(mockQuery.mock.calls[0][1]).toContain(4);
    });

    it('applies date range filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await KillSwitchService.getKillSwitchHistory({
        startDate: '2026-01-01',
        endDate: '2026-02-28',
      });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('created_at >= $1');
      expect(countSql).toContain('created_at <= $2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['2026-01-01', '2026-02-28']);
    });

    it('applies activatedBy filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeKsRow()] });

      await KillSwitchService.getKillSwitchHistory({ activatedBy: USER_ID });

      expect(mockQuery.mock.calls[0][0]).toContain('activated_by = $1');
      expect(mockQuery.mock.calls[0][1]).toContain(USER_ID);
    });

    it('handles pagination with custom page and limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: Array(10).fill(makeKsRow()) });

      const result = await KillSwitchService.getKillSwitchHistory({
        page: 3,
        limit: 10,
      });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(5);
      // LIMIT and OFFSET should be in the data query
      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
      // params: [limit, offset] = [10, 20]
      expect(mockQuery.mock.calls[1][1]).toContain(10);
      expect(mockQuery.mock.calls[1][1]).toContain(20);
    });

    it('returns empty data when no results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await KillSwitchService.getKillSwitchHistory();

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });
});
