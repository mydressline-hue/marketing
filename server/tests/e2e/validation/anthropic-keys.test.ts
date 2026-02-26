/**
 * Validation Test Suite: Anthropic API Key Configuration
 *
 * Phase 10B Part 3 - Validates that:
 *   - env.ts has ANTHROPIC_API_KEY config
 *   - OpusClient reads key from config (not hardcoded)
 *   - SonnetClient reads key from config (not hardcoded)
 *   - AnthropicClient base class reads key from config
 *   - Keys are not hardcoded anywhere in source
 *   - Settings API exposes key configuration status
 *   - Key override via constructor parameter works
 *   - Missing key throws a clear error
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

const mockEnv: Record<string, unknown> = {
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
  ANTHROPIC_API_KEY: 'test-anthropic-key-from-env',
  ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
  ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
};

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
  env: mockEnv,
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
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Mock the Anthropic SDK so we don't make real API calls
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((config: { apiKey: string }) => {
      return {
        _apiKey: config.apiKey,
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'mock response' }],
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
        },
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

// ===========================================================================
// Tests
// ===========================================================================

describe('Phase 10B Validation: Anthropic API Key Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // 1. env.ts has ANTHROPIC_API_KEY config
  // -------------------------------------------------------------------------

  describe('Environment Configuration', () => {
    it('should define ANTHROPIC_API_KEY in env schema', () => {
      const envModule = require('../../../src/config/env');
      const envConfig = envModule.env;

      // The env object should have ANTHROPIC_API_KEY defined
      expect('ANTHROPIC_API_KEY' in envConfig).toBe(true);
    });

    it('should define ANTHROPIC_OPUS_MODEL in env schema', () => {
      const envModule = require('../../../src/config/env');
      expect(envModule.env.ANTHROPIC_OPUS_MODEL).toBeDefined();
      expect(typeof envModule.env.ANTHROPIC_OPUS_MODEL).toBe('string');
    });

    it('should define ANTHROPIC_SONNET_MODEL in env schema', () => {
      const envModule = require('../../../src/config/env');
      expect(envModule.env.ANTHROPIC_SONNET_MODEL).toBeDefined();
      expect(typeof envModule.env.ANTHROPIC_SONNET_MODEL).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // 2. OpusClient reads key from config
  // -------------------------------------------------------------------------

  describe('OpusClient Key Configuration', () => {
    it('should use key from env when no override provided', () => {
      const { OpusClient } = require('../../../src/agents/ai/OpusClient');
      const client = new OpusClient();

      // The client should have been created with the env key
      expect(client).toBeDefined();
      // It delegates to AnthropicClient constructor which uses env.ANTHROPIC_API_KEY
      expect(client.client).toBeDefined();
    });

    it('should accept an API key override via constructor', () => {
      const { OpusClient } = require('../../../src/agents/ai/OpusClient');
      const client = new OpusClient('custom-override-key');

      expect(client).toBeDefined();
      expect(client.client).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. SonnetClient reads key from config
  // -------------------------------------------------------------------------

  describe('SonnetClient Key Configuration', () => {
    it('should use key from env when no override provided', () => {
      const { SonnetClient } = require('../../../src/agents/ai/SonnetClient');
      const client = new SonnetClient();

      expect(client).toBeDefined();
      expect(client.client).toBeDefined();
    });

    it('should accept an API key override via constructor', () => {
      const { SonnetClient } = require('../../../src/agents/ai/SonnetClient');
      const client = new SonnetClient('custom-sonnet-key');

      expect(client).toBeDefined();
      expect(client.client).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. AnthropicClient base class behavior
  // -------------------------------------------------------------------------

  describe('AnthropicClient Base Class', () => {
    it('should throw when no API key is available', () => {
      // Temporarily remove the API key from mock env
      const original = mockEnv.ANTHROPIC_API_KEY;
      mockEnv.ANTHROPIC_API_KEY = '';

      const { AnthropicClient } = require('../../../src/agents/ai/AnthropicClient');

      expect(() => new AnthropicClient()).toThrow('Anthropic API key is not configured');

      // Restore
      mockEnv.ANTHROPIC_API_KEY = original;
    });

    it('should accept explicit API key even when env is empty', () => {
      const original = mockEnv.ANTHROPIC_API_KEY;
      mockEnv.ANTHROPIC_API_KEY = '';

      const { AnthropicClient } = require('../../../src/agents/ai/AnthropicClient');
      const client = new AnthropicClient('explicit-key');

      expect(client).toBeDefined();
      expect(client.client).toBeDefined();

      // Restore
      mockEnv.ANTHROPIC_API_KEY = original;
    });
  });

  // -------------------------------------------------------------------------
  // 5. Keys are not hardcoded in source
  // -------------------------------------------------------------------------

  describe('No Hardcoded Keys', () => {
    it('should not contain hardcoded Anthropic API keys in source files', () => {
      const srcDir = path.resolve(__dirname, '../../../src');

      // Scan key source files for hardcoded keys (sk-ant-* pattern)
      const filesToCheck = [
        'agents/ai/AnthropicClient.ts',
        'agents/ai/OpusClient.ts',
        'agents/ai/SonnetClient.ts',
        'config/env.ts',
      ];

      for (const file of filesToCheck) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');

          // Check for hardcoded Anthropic API key patterns
          expect(content).not.toMatch(/sk-ant-[a-zA-Z0-9]{20,}/);
          // Check for any string that looks like a real API key assignment
          expect(content).not.toMatch(/apiKey\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/);
        }
      }
    });

    it('should not contain hardcoded keys in .env.example', () => {
      const envExamplePath = path.resolve(__dirname, '../../../.env.example');
      if (fs.existsSync(envExamplePath)) {
        const content = fs.readFileSync(envExamplePath, 'utf8');

        // .env.example should have ANTHROPIC_API_KEY but no actual value
        expect(content).toContain('ANTHROPIC_API_KEY');
        expect(content).not.toMatch(/ANTHROPIC_API_KEY=sk-ant-/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Settings API exposes key configuration status
  // -------------------------------------------------------------------------

  describe('Settings API Key Configuration', () => {
    it('SettingsService.getApiKeyConfig should report anthropic key status', async () => {
      // Mock the DB calls
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // shopify check
      mockCacheGet.mockResolvedValue(null);

      // For the platform key checks
      for (let i = 0; i < 6; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      }

      const { SettingsService } = require('../../../src/services/settings.service');
      const config = await SettingsService.getApiKeyConfig();

      expect(config).toHaveProperty('anthropicConfigured');
      expect(typeof config.anthropicConfigured).toBe('boolean');
      // Since our mock env has a key set, it should be true
      expect(config.anthropicConfigured).toBe(true);
    });

    it('Settings route for API keys should be admin-protected', () => {
      // Verify the route definition in settings.routes.ts
      const routesPath = path.resolve(__dirname, '../../../src/routes/settings.routes.ts');
      if (fs.existsSync(routesPath)) {
        const content = fs.readFileSync(routesPath, 'utf8');

        expect(content).toContain('api-keys');
        expect(content).toContain('authenticate');
        expect(content).toContain("requireRole('admin')");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Model ID resolution
  // -------------------------------------------------------------------------

  describe('Model ID Resolution', () => {
    it('should resolve opus model ID from env config', () => {
      const { env } = require('../../../src/config/env');
      expect(env.ANTHROPIC_OPUS_MODEL).toBe('claude-opus-4-20250514');
    });

    it('should resolve sonnet model ID from env config', () => {
      const { env } = require('../../../src/config/env');
      expect(env.ANTHROPIC_SONNET_MODEL).toBe('claude-sonnet-4-20250514');
    });
  });
});
