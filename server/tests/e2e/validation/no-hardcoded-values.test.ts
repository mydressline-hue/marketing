/**
 * Validation Test Suite: No Hardcoded Values
 *
 * Non-negotiable rule: "No hardcoded values."
 *
 * These tests verify that:
 *   - Environment variables are used for all configuration (DB, Redis, JWT, etc.)
 *   - API URLs and secrets are not hardcoded in service files
 *   - Thresholds and limits come from configuration, not magic numbers
 *   - The env.ts config module uses Zod validation for all env vars
 *   - No hardcoded credentials or secrets exist in source code
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVER_SRC_DIR = path.resolve(__dirname, '../../../src');
const SERVER_SERVICES_DIR = path.resolve(SERVER_SRC_DIR, 'services');
const SERVER_CONFIG_DIR = path.resolve(SERVER_SRC_DIR, 'config');
const UI_SRC_DIR = path.resolve(__dirname, '../../../../ui/src');

function getFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Validation: No Hardcoded Values', () => {
  // =========================================================================
  // 1. Environment configuration uses Zod validation
  // =========================================================================

  describe('Environment Configuration', () => {
    const envConfigPath = path.join(SERVER_CONFIG_DIR, 'env.ts');

    it('should have an env.ts configuration file', () => {
      expect(fs.existsSync(envConfigPath)).toBe(true);
    });

    it('should use Zod for environment variable validation', () => {
      const content = readFile(envConfigPath);
      expect(content).toContain("from 'zod'");
      expect(content).toMatch(/z\s*\.\s*object|z\.object/);
      expect(content).toContain('safeParse');
    });

    it('should define all critical environment variables in the schema', () => {
      const content = readFile(envConfigPath);
      const requiredVars = [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'REDIS_URL',
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'ANTHROPIC_API_KEY',
        'CORS_ORIGINS',
        'RATE_LIMIT_WINDOW_MS',
        'RATE_LIMIT_MAX_REQUESTS',
        'LOG_LEVEL',
      ];
      for (const varName of requiredVars) {
        expect(content).toContain(varName);
      }
    });

    it('should enforce production validation for critical secrets', () => {
      const content = readFile(envConfigPath);
      // In production, DATABASE_URL, JWT_SECRET, and ENCRYPTION_KEY must be set
      expect(content).toContain("NODE_ENV === 'production'");
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('JWT_SECRET');
      expect(content).toContain('ENCRYPTION_KEY');
    });
  });

  // =========================================================================
  // 2. No hardcoded secrets in source code
  // =========================================================================

  describe('No Hardcoded Secrets in Source Code', () => {
    const allServerFiles = getFiles(SERVER_SRC_DIR, '.ts');

    it('should not have hardcoded API keys or tokens', () => {
      const secretPatterns = [
        /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        /(?:secret[_-]?key|secretkey)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        /(?:access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
        /Bearer\s+[A-Za-z0-9_-]{20,}/,
      ];
      for (const f of allServerFiles) {
        const content = readFile(f);
        for (const pattern of secretPatterns) {
          const match = content.match(pattern);
          if (match) {
            // Allow test/mock patterns in test directories
            if (f.includes('/tests/') || f.includes('__test__')) continue;
            throw new Error(
              `${path.relative(SERVER_SRC_DIR, f)} contains a potential hardcoded secret: ${match[0].substring(0, 40)}...`,
            );
          }
        }
      }
    });

    it('should not have hardcoded passwords in production source files', () => {
      const allFiles = getFiles(SERVER_SRC_DIR, '.ts').filter(
        (f) =>
          !f.includes('/seeds/') &&
          !f.includes('/migrations/') &&
          !f.includes('/tests/') &&
          !f.includes('__test__'),
      );
      for (const f of allFiles) {
        const content = readFile(f);
        const passwordPattern =
          /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i;
        const match = content.match(passwordPattern);
        if (match) {
          // Skip type definitions, schema definitions, and variable names
          const lineIndex = content.indexOf(match[0]);
          const surroundingText = content.substring(
            Math.max(0, lineIndex - 100),
            lineIndex + match[0].length + 50,
          );
          const isTypeOrSchema =
            surroundingText.includes('interface ') ||
            surroundingText.includes('type ') ||
            surroundingText.includes('z.string') ||
            surroundingText.includes('z.object') ||
            surroundingText.includes('.placeholder') ||
            surroundingText.includes('label:') ||
            surroundingText.includes('example:');
          if (!isTypeOrSchema) {
            throw new Error(
              `${path.relative(SERVER_SRC_DIR, f)} may contain a hardcoded password`,
            );
          }
        }
      }
    });

    it('should not use process.env with hardcoded fallback secrets in services', () => {
      const serviceFiles = getFiles(SERVER_SERVICES_DIR, '.ts');
      for (const f of serviceFiles) {
        const content = readFile(f);
        // Pattern: process.env.SOMETHING || 'hardcoded-value'
        const hardcodedFallbackPattern =
          /process\.env\.\w+\s*\|\|\s*['"][^'"]{8,}['"]/g;
        const matches = content.match(hardcodedFallbackPattern) || [];
        for (const match of matches) {
          throw new Error(
            `${path.relative(SERVER_SRC_DIR, f)} has hardcoded fallback for env var: ${match}`,
          );
        }
      }
    });
  });

  // =========================================================================
  // 3. Services use env config module, not direct process.env
  // =========================================================================

  describe('Services Use Centralized Config', () => {
    const serviceFiles = getFiles(SERVER_SERVICES_DIR, '.ts').filter(
      (f) => !f.includes('/index.ts'),
    );

    it.each(
      serviceFiles.map((f) => [path.relative(SERVER_SERVICES_DIR, f), f]),
    )(
      '%s should not use process.env directly (should use env from config/env)',
      (_name, filePath) => {
        const content = readFile(filePath as string);
        // Count direct process.env usage (excluding comments)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('//') || line.startsWith('*')) continue;
          if (line.includes('process.env')) {
            throw new Error(
              `${_name} line ${i + 1}: Uses process.env directly instead of env config module. Line: "${line.substring(0, 80)}"`,
            );
          }
        }
      },
    );
  });

  // =========================================================================
  // 4. No hardcoded API URLs
  // =========================================================================

  describe('No Hardcoded API URLs', () => {
    const serviceFiles = getFiles(SERVER_SERVICES_DIR, '.ts');

    it.each(
      serviceFiles.map((f) => [path.relative(SERVER_SERVICES_DIR, f), f]),
    )('%s should not contain hardcoded external API URLs', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Match hardcoded URLs that look like API endpoints (not localhost for dev)
      const hardcodedUrlPattern =
        /['"]https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com)[a-z0-9.-]+\.[a-z]{2,}\/api/i;
      expect(content).not.toMatch(hardcodedUrlPattern);
    });
  });

  // =========================================================================
  // 5. Frontend config uses environment variables
  // =========================================================================

  describe('Frontend Configuration', () => {
    it('should use VITE_ prefixed env vars or a config module for API base URL', () => {
      const configFiles = [
        ...getFiles(path.resolve(UI_SRC_DIR, 'config'), '.ts'),
        ...getFiles(path.resolve(UI_SRC_DIR, 'config'), '.tsx'),
      ];
      const hookFiles = getFiles(path.resolve(UI_SRC_DIR, 'hooks'), '.ts');
      const allConfigSources = [...configFiles, ...hookFiles];

      // At least one file should reference import.meta.env or VITE_
      let hasEnvReference = false;
      for (const f of allConfigSources) {
        const content = readFile(f);
        if (
          content.includes('import.meta.env') ||
          content.includes('VITE_') ||
          content.includes('process.env')
        ) {
          hasEnvReference = true;
          break;
        }
      }
      expect(hasEnvReference).toBe(true);
    });
  });

  // =========================================================================
  // 6. Database connection uses configurable parameters
  // =========================================================================

  describe('Database Configuration', () => {
    const dbConfigPath = path.join(SERVER_CONFIG_DIR, 'database.ts');

    it('should have a database config file', () => {
      expect(fs.existsSync(dbConfigPath)).toBe(true);
    });

    it('should use env variables for connection, not hardcoded strings', () => {
      const content = readFile(dbConfigPath);
      // Should reference env or process.env for connection string
      expect(
        content.includes('env.DATABASE_URL') ||
          content.includes('process.env.DATABASE_URL') ||
          content.includes('connectionString'),
      ).toBe(true);
      // Should NOT have hardcoded connection strings in the config
      const hardcodedConnPattern =
        /['"]postgres(?:ql)?:\/\/\w+:\w+@[\w.]+:\d+\/\w+['"]/;
      expect(content).not.toMatch(hardcodedConnPattern);
    });
  });

  // =========================================================================
  // 7. Redis configuration uses env variables
  // =========================================================================

  describe('Redis Configuration', () => {
    const redisConfigPath = path.join(SERVER_CONFIG_DIR, 'redis.ts');

    it('should have a redis config file', () => {
      expect(fs.existsSync(redisConfigPath)).toBe(true);
    });

    it('should use env variables for connection, not hardcoded strings', () => {
      const content = readFile(redisConfigPath);
      expect(
        content.includes('env.REDIS_URL') ||
          content.includes('process.env.REDIS_URL') ||
          content.includes('REDIS_URL'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // 8. Auth configuration uses env for JWT secrets
  // =========================================================================

  describe('Auth Configuration', () => {
    const authServicePath = path.join(SERVER_SERVICES_DIR, 'auth.service.ts');

    it('should use env for JWT secret, not hardcoded string', () => {
      if (!fs.existsSync(authServicePath)) return;
      const content = readFile(authServicePath);
      // Should reference env.JWT_SECRET, not a hardcoded string
      expect(
        content.includes('env.JWT_SECRET') ||
          content.includes('config.JWT_SECRET') ||
          content.includes('JWT_SECRET'),
      ).toBe(true);
      // Should NOT have hardcoded JWT secrets
      const hardcodedSecretPattern = /jwt\.sign\([^)]*['"][A-Za-z0-9_-]{16,}['"]/;
      expect(content).not.toMatch(hardcodedSecretPattern);
    });
  });

  // =========================================================================
  // 9. Rate limiting uses configurable values
  // =========================================================================

  describe('Rate Limiting Configuration', () => {
    it('should define rate limit config in env schema', () => {
      const envContent = readFile(path.join(SERVER_CONFIG_DIR, 'env.ts'));
      expect(envContent).toContain('RATE_LIMIT_WINDOW_MS');
      expect(envContent).toContain('RATE_LIMIT_MAX_REQUESTS');
    });
  });

  // =========================================================================
  // 10. CORS origins are configurable
  // =========================================================================

  describe('CORS Configuration', () => {
    it('should define CORS origins in env schema', () => {
      const envContent = readFile(path.join(SERVER_CONFIG_DIR, 'env.ts'));
      expect(envContent).toContain('CORS_ORIGINS');
    });

    it('should not have hardcoded CORS origins in middleware', () => {
      const middlewareFiles = getFiles(
        path.resolve(SERVER_SRC_DIR, 'middleware'),
        '.ts',
      );
      for (const f of middlewareFiles) {
        const content = readFile(f);
        // Should not have hardcoded origins (except in env references)
        const hardcodedOriginPattern =
          /origin:\s*['"]https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}['"]/i;
        expect(content).not.toMatch(hardcodedOriginPattern);
      }
    });
  });
});
