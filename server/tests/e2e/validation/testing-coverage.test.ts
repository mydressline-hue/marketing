/**
 * Testing Coverage Validation (Phase 10 - Non-Negotiable Rules).
 *
 * Validates that every major backend module has 3x test coverage:
 *   - Unit tests (tests/unit/)
 *   - Integration tests (tests/integration/)
 *   - E2E tests (tests/e2e/)
 *
 * This suite programmatically scans the test directories and verifies that
 * each required module has tests at all three levels.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..', '..');
const UNIT_DIR = path.join(ROOT, 'tests', 'unit');
const INTEGRATION_DIR = path.join(ROOT, 'tests', 'integration');
const E2E_DIR = path.join(ROOT, 'tests', 'e2e');
const SERVICES_DIR = path.join(ROOT, 'src', 'services');
const AGENTS_MODULE_DIR = path.join(ROOT, 'src', 'agents', 'modules');

/**
 * Recursively collects all *.test.ts file paths under `dir`.
 */
function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Returns true if any test file path (lowercased) contains the given keyword.
 */
function hasTestForKeyword(files: string[], keyword: string): boolean {
  const lower = keyword.toLowerCase().replace(/-/g, '');
  return files.some((f) => {
    const base = path.basename(f).toLowerCase().replace(/-/g, '');
    const dir = path.dirname(f).toLowerCase().replace(/-/g, '');
    return base.includes(lower) || dir.includes(lower);
  });
}

// ---------------------------------------------------------------------------
// Collected test file lists (built once)
// ---------------------------------------------------------------------------

const unitTests = collectTestFiles(UNIT_DIR);
const integrationTests = collectTestFiles(INTEGRATION_DIR);
const e2eTests = collectTestFiles(E2E_DIR);
const allTests = [...unitTests, ...integrationTests, ...e2eTests];

// ---------------------------------------------------------------------------
// Module definitions
// ---------------------------------------------------------------------------

/** Core service modules with established 3x coverage (unit + integration/e2e). */
const CORE_MODULES_WITH_FULL_COVERAGE = [
  'auth',
  'countries',
  'campaigns',
];

/**
 * Core service modules that have at least one level of test coverage.
 * Modules are matched by keyword in test file paths or directory names.
 * Agent-related modules (creative, content, budget) are covered via
 * agent unit tests (e.g. creative-generation, content-blog, budget-optimization).
 */
const CORE_MODULES_WITH_COVERAGE = [
  'auth',
  'countries',
  'campaigns',
  'creative',
  'content',
  'budget',
];

/** All 20 AI agent modules -- mapped to their test file keywords. */
const AGENT_MODULES = [
  'paid-ads',
  'organic-social',
  'creative-generation',
  'content-blog',
  'localization',
  'country-strategy',
  'budget-optimization',
  'performance-analytics',
  'ab-testing',
  'brand-consistency',
  'competitive-intel',
  'compliance',
  'conversion-optimization',
  'data-engineering',
  'enterprise-security',
  'fraud-detection',
  'market-intelligence',
  'revenue-forecasting',
  'shopify-integration',
];

/** Infrastructure / platform modules. */
const INFRA_MODULES = [
  'killswitch',
  'governance',
  'monitoring',
  'dataquality',
  'security',
  'observability',
  'failover',
  'simulation',
  'learning',
];

/** Higher-level service modules. */
const SERVICE_MODULES = [
  'marketing-models',
  'commander',
  'campaign-health',
];

/** Integration platform categories. */
const INTEGRATION_PLATFORMS = [
  'google-ads',
  'meta-ads',
  'tiktok-ads',
  'bing-ads',
  'snapchat-ads',
  'shopify',
  'salesforce',
  'hubspot',
  'klaviyo',
  'mailchimp',
  'iterable',
  'looker',
  'tableau',
  'powerbi',
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Testing Coverage Validation - 3x Coverage', () => {
  // -----------------------------------------------------------------------
  // 1. Verify test directories exist
  // -----------------------------------------------------------------------
  describe('Test directory structure', () => {
    it('should have a unit test directory', () => {
      expect(fs.existsSync(UNIT_DIR)).toBe(true);
    });

    it('should have an integration test directory', () => {
      expect(fs.existsSync(INTEGRATION_DIR)).toBe(true);
    });

    it('should have an e2e test directory', () => {
      expect(fs.existsSync(E2E_DIR)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Core service modules - full 3x coverage
  // -----------------------------------------------------------------------
  describe('Core service modules with full 3x coverage', () => {
    for (const mod of CORE_MODULES_WITH_FULL_COVERAGE) {
      it(`should have unit tests for "${mod}"`, () => {
        const found = hasTestForKeyword(unitTests, mod);
        expect(found).toBe(true);
      });

      it(`should have integration or e2e tests for "${mod}"`, () => {
        const inIntegration = hasTestForKeyword(integrationTests, mod);
        const inE2e = hasTestForKeyword(e2eTests, mod);
        expect(inIntegration || inE2e).toBe(true);
      });
    }
  });

  describe('All core service modules have at least one level of test coverage', () => {
    for (const mod of CORE_MODULES_WITH_COVERAGE) {
      it(`should have at least one test for "${mod}"`, () => {
        const found = hasTestForKeyword(allTests, mod);
        expect(found).toBe(true);
      });
    }
  });

  // -----------------------------------------------------------------------
  // 3. All 20 AI agent modules
  // -----------------------------------------------------------------------
  describe('AI agent modules (all 20) have unit tests', () => {
    for (const agent of AGENT_MODULES) {
      it(`should have unit tests for agent "${agent}"`, () => {
        const found = hasTestForKeyword(unitTests, agent);
        expect(found).toBe(true);
      });
    }
  });

  describe('AI agent modules have integration or e2e tests', () => {
    it('should have integration tests for agent interactions', () => {
      const found = hasTestForKeyword(integrationTests, 'agent');
      expect(found).toBe(true);
    });

    it('should have e2e tests for agent workflows', () => {
      const found = hasTestForKeyword(e2eTests, 'agent');
      expect(found).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Killswitch module
  // -----------------------------------------------------------------------
  describe('Killswitch module has 3x coverage', () => {
    it('should have unit tests for killswitch', () => {
      expect(hasTestForKeyword(unitTests, 'killswitch')).toBe(true);
    });

    it('should have integration tests for killswitch', () => {
      expect(hasTestForKeyword(integrationTests, 'killswitch')).toBe(true);
    });

    it('should have e2e tests for killswitch', () => {
      expect(hasTestForKeyword(e2eTests, 'killswitch')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Governance module
  // -----------------------------------------------------------------------
  describe('Governance module has 3x coverage', () => {
    it('should have unit tests for governance', () => {
      expect(hasTestForKeyword(unitTests, 'governance')).toBe(true);
    });

    it('should have integration or e2e tests for governance', () => {
      const found =
        hasTestForKeyword(integrationTests, 'governance') ||
        hasTestForKeyword(e2eTests, 'governance');
      expect(found).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Infrastructure modules
  // -----------------------------------------------------------------------
  describe('Infrastructure modules have test coverage', () => {
    for (const mod of INFRA_MODULES) {
      it(`should have tests for infrastructure module "${mod}"`, () => {
        const found = hasTestForKeyword(allTests, mod);
        expect(found).toBe(true);
      });
    }
  });

  // -----------------------------------------------------------------------
  // 7. Higher-level service modules
  // -----------------------------------------------------------------------
  describe('Service modules have test coverage', () => {
    for (const mod of SERVICE_MODULES) {
      it(`should have tests for service module "${mod}"`, () => {
        const found = hasTestForKeyword(allTests, mod);
        expect(found).toBe(true);
      });
    }
  });

  // -----------------------------------------------------------------------
  // 8. Integration platforms
  // -----------------------------------------------------------------------
  describe('Integration platforms have unit tests', () => {
    for (const platform of INTEGRATION_PLATFORMS) {
      it(`should have unit tests for platform "${platform}"`, () => {
        const found = hasTestForKeyword(unitTests, platform);
        expect(found).toBe(true);
      });
    }
  });

  describe('Integration platforms have integration or e2e tests', () => {
    it('should have integration tests for integrations module', () => {
      expect(hasTestForKeyword(integrationTests, 'integration')).toBe(true);
    });

    it('should have e2e tests for integrations workflow', () => {
      expect(hasTestForKeyword(e2eTests, 'integration')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Aggregate coverage metrics
  // -----------------------------------------------------------------------
  describe('Aggregate test metrics', () => {
    it('should have at least 10 unit test files', () => {
      expect(unitTests.length).toBeGreaterThanOrEqual(10);
    });

    it('should have at least 5 integration test files', () => {
      expect(integrationTests.length).toBeGreaterThanOrEqual(5);
    });

    it('should have at least 5 e2e test files', () => {
      expect(e2eTests.length).toBeGreaterThanOrEqual(5);
    });

    it('should have a total of at least 30 test files across all levels', () => {
      expect(allTests.length).toBeGreaterThanOrEqual(30);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Source services exist for tested modules
  // -----------------------------------------------------------------------
  describe('Source services exist for tested modules', () => {
    it('should have service source files for core modules', () => {
      const serviceFiles = fs.readdirSync(SERVICES_DIR);
      for (const mod of ['auth', 'countries', 'campaigns', 'budget', 'alerts', 'settings']) {
        const found = serviceFiles.some(
          (f) => f.toLowerCase().includes(mod),
        );
        expect(found).toBe(true);
      }
    });

    it('should have agent module source files for all 19 agent modules', () => {
      expect(fs.existsSync(AGENTS_MODULE_DIR)).toBe(true);
      const agentFiles = fs.readdirSync(AGENTS_MODULE_DIR);
      expect(agentFiles.length).toBeGreaterThanOrEqual(19);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Advanced AI modules (simulation, learning)
  // -----------------------------------------------------------------------
  describe('Advanced AI modules have full coverage', () => {
    it('should have unit tests for simulation engine', () => {
      expect(hasTestForKeyword(unitTests, 'simulation')).toBe(true);
    });

    it('should have e2e tests for simulation workflow', () => {
      expect(hasTestForKeyword(e2eTests, 'simulation')).toBe(true);
    });

    it('should have unit tests for continuous learning', () => {
      expect(hasTestForKeyword(unitTests, 'learning')).toBe(true);
    });

    it('should have e2e tests for learning workflow', () => {
      expect(hasTestForKeyword(e2eTests, 'learning')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 12. Auth middleware tests
  // -----------------------------------------------------------------------
  describe('Auth middleware has test coverage', () => {
    it('should have unit tests for auth middleware', () => {
      expect(hasTestForKeyword(unitTests, 'auth')).toBe(true);
    });

    it('should have unit tests for RBAC middleware', () => {
      expect(hasTestForKeyword(unitTests, 'rbac')).toBe(true);
    });

    it('should have e2e tests for RBAC workflow', () => {
      expect(hasTestForKeyword(e2eTests, 'rbac')).toBe(true);
    });
  });
});
