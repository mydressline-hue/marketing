/**
 * Test Coverage Report Service.
 *
 * Phase 10 Final Output Deliverable - Testing Coverage Report.
 * Scans the test directories (unit, integration, e2e), counts test files and
 * test cases per module, and produces a structured coverage report.
 *
 * All data is derived from the filesystem -- no hardcoded counts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Coverage breakdown for a single module.
 */
export interface ModuleCoverage {
  /** Module name (e.g. "auth", "killswitch", "paid-ads") */
  module: string;
  /** Number of unit test files found */
  unit_tests: number;
  /** Number of integration test files found */
  integration_tests: number;
  /** Number of e2e test files found */
  e2e_tests: number;
  /** Sum of all test files across levels */
  total: number;
}

/**
 * The full test coverage report output.
 */
export interface TestCoverageReport {
  /** Total number of test files discovered */
  total_test_files: number;
  /** Estimated total number of test cases (based on `it(` / `test(` counts) */
  total_test_cases: number;
  /** Per-module breakdown */
  coverage_by_module: ModuleCoverage[];
  /** Number of modules with tests at all three levels (unit + integration + e2e) */
  modules_with_3x_coverage: number;
  /** Module names that are missing coverage at one or more levels */
  modules_missing_coverage: string[];
  /** Overall pass/fail status: pass if all tracked modules have 3x coverage */
  overall_status: 'pass' | 'fail';
  /** ISO-8601 timestamp when this report was generated */
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Root of the server package (one level up from src/services/final-outputs/) */
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');

const UNIT_DIR = path.join(SERVER_ROOT, 'tests', 'unit');
const INTEGRATION_DIR = path.join(SERVER_ROOT, 'tests', 'integration');
const E2E_DIR = path.join(SERVER_ROOT, 'tests', 'e2e');

/**
 * Canonical module names to track for 3x coverage.
 * Each entry is a keyword used to match test file paths.
 */
const TRACKED_MODULES: string[] = [
  'auth',
  'countries',
  'campaigns',
  'killswitch',
  'governance',
  'monitoring',
  'dataquality',
  'security',
  'observability',
  'failover',
  'simulation',
  'learning',
  'agent',
  'integration',
  'infrastructure',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collects all *.test.ts file paths under `dir`.
 */
function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Counts the number of `it(` and `test(` calls in a test file as a rough
 * estimate of the number of test cases.
 */
function countTestCases(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const itMatches = content.match(/\bit\s*\(/g);
    const testMatches = content.match(/\btest\s*\(/g);
    return (itMatches?.length ?? 0) + (testMatches?.length ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Returns the number of test files in `files` whose path (lowercased)
 * contains the given keyword (with hyphens stripped for fuzzy matching).
 */
function countForKeyword(files: string[], keyword: string): number {
  const normalized = keyword.toLowerCase().replace(/-/g, '');
  return files.filter((f) => {
    const lower = f.toLowerCase().replace(/-/g, '');
    return lower.includes(normalized);
  }).length;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TestCoverageReportService {
  /**
   * Generates a comprehensive test coverage report by scanning the test
   * directories on disk.
   *
   * @returns A structured report with per-module coverage and overall status.
   */
  static generateTestCoverageReport(): TestCoverageReport {
    logger.info('Generating test coverage report...');

    // Collect all test files
    const unitFiles = collectTestFiles(UNIT_DIR);
    const integrationFiles = collectTestFiles(INTEGRATION_DIR);
    const e2eFiles = collectTestFiles(E2E_DIR);
    const allFiles = [...unitFiles, ...integrationFiles, ...e2eFiles];

    // Count total test cases across all files
    const totalTestCases = allFiles.reduce(
      (sum, file) => sum + countTestCases(file),
      0,
    );

    // Build per-module coverage
    const coverageByModule: ModuleCoverage[] = TRACKED_MODULES.map((mod) => {
      const unitCount = countForKeyword(unitFiles, mod);
      const integrationCount = countForKeyword(integrationFiles, mod);
      const e2eCount = countForKeyword(e2eFiles, mod);
      return {
        module: mod,
        unit_tests: unitCount,
        integration_tests: integrationCount,
        e2e_tests: e2eCount,
        total: unitCount + integrationCount + e2eCount,
      };
    });

    // Determine which modules have full 3x coverage
    const modulesWith3x = coverageByModule.filter(
      (m) => m.unit_tests > 0 && m.integration_tests > 0 && m.e2e_tests > 0,
    );

    // Determine which modules are missing coverage at any level
    const modulesMissingCoverage = coverageByModule
      .filter(
        (m) =>
          m.unit_tests === 0 ||
          m.integration_tests === 0 ||
          m.e2e_tests === 0,
      )
      .map((m) => {
        const missing: string[] = [];
        if (m.unit_tests === 0) missing.push('unit');
        if (m.integration_tests === 0) missing.push('integration');
        if (m.e2e_tests === 0) missing.push('e2e');
        return `${m.module} (missing: ${missing.join(', ')})`;
      });

    const overallStatus: 'pass' | 'fail' =
      modulesMissingCoverage.length === 0 ? 'pass' : 'fail';

    const report: TestCoverageReport = {
      total_test_files: allFiles.length,
      total_test_cases: totalTestCases,
      coverage_by_module: coverageByModule,
      modules_with_3x_coverage: modulesWith3x.length,
      modules_missing_coverage: modulesMissingCoverage,
      overall_status: overallStatus,
      generated_at: new Date().toISOString(),
    };

    logger.info('Test coverage report generated', {
      totalFiles: report.total_test_files,
      totalCases: report.total_test_cases,
      modulesWith3x: report.modules_with_3x_coverage,
      overallStatus: report.overall_status,
    });

    return report;
  }
}
