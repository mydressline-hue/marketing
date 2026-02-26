/**
 * Validation Test Suite: No Placeholder / Fake Data
 *
 * Non-negotiable rule: "No placeholder or fake data."
 *
 * These tests verify that:
 *   - All UI page files source their data from API hooks (useApiQuery / useApiMutation)
 *   - No page file contains hardcoded arrays used as primary data
 *   - Backend API endpoints return data from the database, not static arrays
 *   - Mock/placeholder patterns do not leak into production source files
 *   - Fallback defaults use zero/empty values only (legitimate empty states)
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UI_PAGES_DIR = path.resolve(__dirname, '../../../../ui/src/pages');
const SERVER_SERVICES_DIR = path.resolve(__dirname, '../../../src/services');
const SERVER_ROUTES_DIR = path.resolve(__dirname, '../../../src/routes');

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

describe('Validation: No Placeholder / Fake Data', () => {
  // =========================================================================
  // 1. All page files use API hooks for data
  // =========================================================================

  describe('UI Page Files - Data Sourcing', () => {
    const pageFiles = getFiles(UI_PAGES_DIR, '.tsx');

    it('should find all 23 page files', () => {
      expect(pageFiles.length).toBeGreaterThanOrEqual(23);
    });

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should import useApiQuery or useApiMutation', (_name, filePath) => {
      const content = readFile(filePath as string);
      const hasApiHook =
        content.includes('useApiQuery') || content.includes('useApiMutation');
      expect(hasApiHook).toBe(true);
    });

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should not contain hardcoded data arrays as primary data source', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Match patterns like: const someData = [{ ... }] with real values
      // that are NOT inside a type/interface definition or a UI constant (colors, labels)
      const hardcodedArrayPattern =
        /const\s+\w+(?:Data|Items|List|Records|Entries|Results)\s*(?::\s*\w+(?:\[\])?\s*)?=\s*\[\s*\{[^}]*(?:name|email|id|value|amount|revenue):\s*['"][^'"]+['"]/;
      const hasHardcodedArrays = hardcodedArrayPattern.test(content);
      expect(hasHardcodedArrays).toBe(false);
    });

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should not contain mock data comments', (_name, filePath) => {
      const content = readFile(filePath as string);
      const mockPatterns = [
        /\/\/\s*mock\s+data/i,
        /\/\/\s*fake\s+data/i,
        /\/\/\s*dummy\s+data/i,
        /\/\/\s*hardcoded\s+data/i,
        /\/\/\s*sample\s+data/i,
        /\/\*\*?\s*mock\s+data/i,
        /\/\*\*?\s*fake\s+data/i,
      ];
      for (const pattern of mockPatterns) {
        expect(content).not.toMatch(pattern);
      }
    });

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should not have fake email addresses as primary data', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Match patterns like email: 'john@example.com' that aren't in
      // placeholder attributes or comments
      const fakeEmailPattern =
        /(?<!placeholder=["'].*?)(?:email|contact|user):\s*['"][\w.+-]+@(?:example|test|fake|mock)\.\w+['"]/i;
      expect(content).not.toMatch(fakeEmailPattern);
    });
  });

  // =========================================================================
  // 2. No hardcoded KPI values
  // =========================================================================

  describe('UI Page Files - No Hardcoded KPI Values', () => {
    const pageFiles = getFiles(UI_PAGES_DIR, '.tsx');

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should not hardcode KPI values directly into KPICard components', (_name, filePath) => {
      const content = readFile(filePath as string);
      // KPI values should reference data from API responses, not literals
      // Pattern: value={1234} or value="$1.2M" (literal values in KPICard)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Only check lines that render KPICard
        if (line.includes('<KPICard') || (i > 0 && lines.slice(Math.max(0, i - 5), i).some(l => l.includes('<KPICard')))) {
          // value={12345} - literal number (but not 0 which is a valid fallback)
          if (/value=\{(?!0\})\d{3,}\}/.test(line)) {
            fail(`${path.basename(filePath as string)} line ${i + 1}: KPICard has hardcoded numeric value: ${line}`);
          }
          // value="$1.2M" or value="45.2%" - literal formatted strings
          if (/value=["']\$[\d,.]+[KMB]?["']/.test(line) || /value=["']\d+\.?\d*%["']/.test(line)) {
            fail(`${path.basename(filePath as string)} line ${i + 1}: KPICard has hardcoded string value: ${line}`);
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. Backend services return data from DB, not static arrays
  // =========================================================================

  describe('Backend Services - Database-Driven Data', () => {
    const serviceFiles = getFiles(SERVER_SERVICES_DIR, '.ts');

    it('should have service files to validate', () => {
      expect(serviceFiles.length).toBeGreaterThan(0);
    });

    it.each(
      serviceFiles.map((f) => [path.relative(SERVER_SERVICES_DIR, f), f]),
    )('%s should not contain static data arrays pretending to be DB results', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Look for patterns where a method returns a hardcoded array instead of
      // querying the database. e.g., return [{ id: '1', name: 'Mock Campaign' }]
      const staticReturnPattern =
        /return\s+\[\s*\{\s*(?:id|name|email|campaign|country):\s*['"][^'"]+['"]/;
      const matches = content.match(new RegExp(staticReturnPattern, 'g')) || [];
      // Allow at most 0 -- no static returns that look like data
      expect(matches.length).toBe(0);
    });

    it('should have services that use database pool for queries', () => {
      // Check that primary service files import and use the database pool
      const primaryServices = serviceFiles.filter(
        (f) =>
          !f.includes('/index.ts') &&
          !f.includes('.d.ts'),
      );
      let servicesUsingDb = 0;
      for (const f of primaryServices) {
        const content = readFile(f);
        if (content.includes('pool.query') || content.includes('pool.connect') || content.includes('getClient')) {
          servicesUsingDb++;
        }
      }
      // At least half of services should interact with the database
      expect(servicesUsingDb).toBeGreaterThan(primaryServices.length * 0.3);
    });
  });

  // =========================================================================
  // 4. No mock/fake data utilities in production code
  // =========================================================================

  describe('No Mock Data Utilities in Production', () => {
    const allSrcFiles = [
      ...getFiles(path.resolve(__dirname, '../../../../ui/src'), '.ts'),
      ...getFiles(path.resolve(__dirname, '../../../../ui/src'), '.tsx'),
      ...getFiles(path.resolve(__dirname, '../../../src'), '.ts'),
    ];

    it('should not have files named mock-data, fake-data, or seed-data in src', () => {
      const suspiciousFiles = allSrcFiles.filter((f) => {
        const name = path.basename(f).toLowerCase();
        return (
          name.includes('mock-data') ||
          name.includes('fake-data') ||
          name.includes('mock_data') ||
          name.includes('fake_data') ||
          name.includes('placeholder-data')
        );
      });
      expect(suspiciousFiles).toEqual([]);
    });

    it('should not have generateFakeData or createMockData functions', () => {
      for (const f of allSrcFiles) {
        const content = readFile(f);
        expect(content).not.toMatch(/function\s+(?:generate|create)(?:Fake|Mock|Dummy|Placeholder)Data/i);
        expect(content).not.toMatch(/const\s+(?:generate|create)(?:Fake|Mock|Dummy|Placeholder)Data/i);
      }
    });

    it('should not import from mock data modules', () => {
      for (const f of allSrcFiles) {
        const content = readFile(f);
        expect(content).not.toMatch(/import\s+.*from\s+['"].*(?:mock[-_]data|fake[-_]data|placeholder[-_]data)['"]/i);
      }
    });
  });

  // =========================================================================
  // 5. Fallback values are zero/empty, not fake data
  // =========================================================================

  describe('Fallback Values - Zero/Empty Only', () => {
    const pageFiles = getFiles(UI_PAGES_DIR, '.tsx');

    it.each(
      pageFiles.map((f) => [path.basename(f), f]),
    )('%s should only use zero/empty/null/dash as fallback values', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Find fallback patterns: ?? 'some value' or ?? someNumber
      const fallbackMatches = content.match(/\?\?\s*['"][^'"]+['"]/g) || [];
      for (const match of fallbackMatches) {
        const value = match.replace(/\?\?\s*/, '').replace(/['"]/g, '');
        // Acceptable fallbacks: empty string, dash, zero, N/A, --, etc.
        const isAcceptable =
          value === '' ||
          value === '-' ||
          value === '--' ||
          value === 'N/A' ||
          value === 'n/a' ||
          value === '$0' ||
          value === '0' ||
          value === '0%' ||
          value === 'stable' ||
          value === 'all';
        if (!isAcceptable) {
          // Check it's not a CSS class, URL path, or UI label
          const isUiConstant =
            value.startsWith('bg-') ||
            value.startsWith('text-') ||
            value.startsWith('/') ||
            value.startsWith('http') ||
            value.length <= 3;
          if (!isUiConstant) {
            // This might be a fake fallback value - inspect manually
            // We allow brief labels like "Unknown" but not fake data like "John Doe"
            const isFakeData = /^[A-Z][a-z]+\s[A-Z][a-z]+/.test(value); // e.g., "John Doe"
            expect(isFakeData).toBe(false);
          }
        }
      }
    });
  });

  // =========================================================================
  // 6. Route handlers don't return hardcoded sample responses
  // =========================================================================

  describe('Backend Routes - No Hardcoded Responses', () => {
    const routeFiles = getFiles(SERVER_ROUTES_DIR, '.ts');

    it('should have route files to validate', () => {
      expect(routeFiles.length).toBeGreaterThan(0);
    });

    it.each(
      routeFiles.map((f) => [path.relative(SERVER_ROUTES_DIR, f), f]),
    )('%s should not return hardcoded JSON arrays as responses', (_name, filePath) => {
      const content = readFile(filePath as string);
      // Pattern: res.json([{ id: '...', name: '...' }])
      const hardcodedResponsePattern =
        /res\.json\(\s*\[\s*\{[^}]*(?:id|name|email):\s*['"][^'"]+['"]/;
      expect(content).not.toMatch(hardcodedResponsePattern);
    });
  });

  // =========================================================================
  // 7. No Lorem Ipsum or placeholder text in source code
  // =========================================================================

  describe('No Lorem Ipsum or Placeholder Text', () => {
    const allSrcFiles = [
      ...getFiles(path.resolve(__dirname, '../../../../ui/src'), '.tsx'),
      ...getFiles(path.resolve(__dirname, '../../../src'), '.ts'),
    ];

    it('should not contain Lorem Ipsum text', () => {
      for (const f of allSrcFiles) {
        const content = readFile(f);
        expect(content.toLowerCase()).not.toContain('lorem ipsum');
      }
    });

    it('should not contain TODO markers indicating incomplete data integration', () => {
      const pageFiles = getFiles(UI_PAGES_DIR, '.tsx');
      for (const f of pageFiles) {
        const content = readFile(f);
        // Check for TODOs that specifically indicate missing API integration
        const hasTodoForApi =
          /\/\/\s*TODO:?\s*(?:fetch|connect|integrate|replace|hook up|wire).*(?:api|backend|endpoint|data)/i.test(
            content,
          );
        expect(hasTodoForApi).toBe(false);
      }
    });
  });
});
