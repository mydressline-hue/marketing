import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';

const MIGRATIONS_DIR = path.resolve(__dirname);

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      checksum    VARCHAR(64) NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function computeChecksum(content: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(content).digest('hex');
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY id ASC',
  );
  return new Set(result.rows.map((row) => row.filename));
}

function getMigrationFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function runMigrations(): Promise<void> {
  console.log('=== Database Migration Runner ===\n');

  try {
    // Ensure the _migrations tracking table exists
    await ensureMigrationsTable();
    console.log('[OK] Migrations tracking table ready.');

    // Get already-applied migrations
    const applied = await getAppliedMigrations();
    console.log(`[INFO] ${applied.size} migration(s) already applied.\n`);

    // Discover SQL files
    const migrationFiles = getMigrationFiles();

    if (migrationFiles.length === 0) {
      console.log('[INFO] No migration files found.');
      return;
    }

    console.log(`[INFO] Found ${migrationFiles.length} migration file(s).\n`);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of migrationFiles) {
      if (applied.has(filename)) {
        console.log(`[SKIP] ${filename} (already applied)`);
        skippedCount++;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf-8');
      const checksum = computeChecksum(sql);

      console.log(`[RUN]  ${filename}...`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Execute the migration SQL
        await client.query(sql);

        // Record the migration as applied
        await client.query(
          'INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );

        await client.query('COMMIT');

        console.log(`[OK]   ${filename} applied successfully.`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[FAIL] ${filename} failed to apply.`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`  Applied: ${appliedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Total:   ${migrationFiles.length}`);
    console.log('\n[DONE] All migrations processed successfully.');
  } catch (err) {
    console.error('\n[ERROR] Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
