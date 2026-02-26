/**
 * Migration Verification Script.
 *
 * Checks that all expected migration files (001 through 006) exist in the
 * migrations directory, are ordered correctly, and have non-empty content.
 * Exits with code 0 on success, 1 on failure.
 *
 * Usage:
 *   npx tsx src/migrations/verify.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(__dirname);

const EXPECTED_MIGRATIONS = [
  '001_initial_schema.sql',
  '002_phase5_phase6_tables.sql',
  '003_phase7_tables.sql',
  '004_phase8_tables.sql',
  '005_new_features.sql',
  '006_final_outputs.sql',
];

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

interface VerificationResult {
  file: string;
  exists: boolean;
  sizeBytes: number;
  checksum: string;
  error?: string;
}

function verifyMigrations(): void {
  console.log('=== Migration Verification ===\n');
  console.log(`Migration directory: ${MIGRATIONS_DIR}\n`);

  const results: VerificationResult[] = [];
  let hasErrors = false;

  // ── Check each expected migration ──────────────────────────────────────
  for (const filename of EXPECTED_MIGRATIONS) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const result: VerificationResult = {
      file: filename,
      exists: false,
      sizeBytes: 0,
      checksum: '',
    };

    try {
      if (!fs.existsSync(filePath)) {
        result.error = 'File not found';
        hasErrors = true;
        results.push(result);
        continue;
      }

      result.exists = true;

      const stat = fs.statSync(filePath);
      result.sizeBytes = stat.size;

      if (stat.size === 0) {
        result.error = 'File is empty';
        hasErrors = true;
        results.push(result);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      result.checksum = crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);

      results.push(result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      hasErrors = true;
      results.push(result);
    }
  }

  // ── Check ordering ─────────────────────────────────────────────────────
  console.log('Migration Files:');
  console.log('─'.repeat(70));

  for (const r of results) {
    const status = r.error ? 'FAIL' : 'OK';
    const icon = r.error ? '[FAIL]' : '[ OK ]';
    const details = r.error
      ? r.error
      : `${r.sizeBytes} bytes | sha256:${r.checksum}`;

    console.log(`  ${icon} ${r.file}`);
    console.log(`         ${details}`);
  }

  console.log('─'.repeat(70));

  // ── Check for unexpected files ─────────────────────────────────────────
  const allSqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const unexpectedFiles = allSqlFiles.filter(
    (f) => !EXPECTED_MIGRATIONS.includes(f),
  );

  if (unexpectedFiles.length > 0) {
    console.log('\nAdditional migration files found (not in expected list):');
    for (const f of unexpectedFiles) {
      console.log(`  [INFO] ${f}`);
    }
  }

  // ── Check sequential numbering ─────────────────────────────────────────
  console.log('\nSequence Check:');
  const existingSqlFiles = allSqlFiles.filter((f) =>
    fs.existsSync(path.join(MIGRATIONS_DIR, f)),
  );

  let prevNumber = 0;
  let sequenceOk = true;

  for (const f of existingSqlFiles) {
    const match = f.match(/^(\d+)_/);
    if (!match) {
      console.log(`  [WARN] File does not follow numbering convention: ${f}`);
      continue;
    }

    const num = parseInt(match[1], 10);
    if (num !== prevNumber + 1) {
      console.log(`  [FAIL] Gap in sequence: expected ${String(prevNumber + 1).padStart(3, '0')}, found ${match[1]}`);
      sequenceOk = false;
      hasErrors = true;
    }
    prevNumber = num;
  }

  if (sequenceOk) {
    console.log(`  [ OK ] Sequential numbering verified (001 through ${String(prevNumber).padStart(3, '0')})`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const passCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;

  console.log('\n=== Verification Summary ===');
  console.log(`  Expected: ${EXPECTED_MIGRATIONS.length}`);
  console.log(`  Passed:   ${passCount}`);
  console.log(`  Failed:   ${failCount}`);
  console.log(`  Extra:    ${unexpectedFiles.length}`);

  if (hasErrors) {
    console.log('\n[FAIL] Migration verification failed.');
    process.exit(1);
  }

  console.log('\n[ OK ] All migrations verified successfully.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

verifyMigrations();
