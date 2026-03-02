import { Pool } from 'pg';

let testPool: Pool | null = null;
const testSchema = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function initTestDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/ai_growth_engine_test';

  testPool = new Pool({ connectionString: databaseUrl, max: 5 });

  // Create test schema for isolation
  await testPool.query(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);
  await testPool.query(`SET search_path TO "${testSchema}", public`);

  // Create core tables
  const tables = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'viewer',
      mfa_secret VARCHAR(255),
      mfa_enabled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS countries (
      code VARCHAR(3) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      flag VARCHAR(10),
      opportunity_score DECIMAL(5,2) DEFAULT 0,
      gdp VARCHAR(50),
      internet_penetration DECIMAL(5,2) DEFAULT 0,
      ecommerce_adoption DECIMAL(5,2) DEFAULT 0,
      ad_cost_index DECIMAL(5,2) DEFAULT 1.0,
      entry_strategy VARCHAR(255),
      status VARCHAR(50) DEFAULT 'research',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      country VARCHAR(3) REFERENCES countries(code),
      status VARCHAR(50) DEFAULT 'draft',
      budget DECIMAL(12,2) DEFAULT 0,
      spent DECIMAL(12,2) DEFAULT 0,
      impressions BIGINT DEFAULT 0,
      clicks BIGINT DEFAULT 0,
      conversions BIGINT DEFAULT 0,
      roas DECIMAL(8,2) DEFAULT 0,
      cpc DECIMAL(8,2) DEFAULT 0,
      ctr DECIMAL(8,4) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      type VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      language VARCHAR(10) DEFAULT 'en',
      country VARCHAR(3) REFERENCES countries(code),
      seo_score DECIMAL(5,2) DEFAULT 0,
      body TEXT,
      publish_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS budget_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel VARCHAR(100) NOT NULL,
      allocated DECIMAL(12,2) DEFAULT 0,
      spent DECIMAL(12,2) DEFAULT 0,
      remaining DECIMAL(12,2) DEFAULT 0,
      roas DECIMAL(8,2) DEFAULT 0,
      recommendation VARCHAR(50) DEFAULT 'maintain',
      period VARCHAR(20) DEFAULT 'monthly',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS killswitch_state (
      id SERIAL PRIMARY KEY,
      level VARCHAR(50) NOT NULL,
      active BOOLEAN DEFAULT FALSE,
      activated_by UUID,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_states (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_name VARCHAR(100) NOT NULL,
      status VARCHAR(50) DEFAULT 'idle',
      confidence DECIMAL(5,2) DEFAULT 0,
      last_action TEXT,
      tasks_completed INT DEFAULT 0,
      tasks_pending INT DEFAULT 0,
      state_data JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      channel VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255),
      message TEXT,
      read BOOLEAN DEFAULT FALSE,
      delivered BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url VARCHAR(500) NOT NULL,
      events TEXT[] NOT NULL,
      secret VARCHAR(255),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(50) NOT NULL,
      source VARCHAR(100),
      message TEXT NOT NULL,
      severity VARCHAR(20) DEFAULT 'info',
      acknowledged BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      inventory INT DEFAULT 0,
      synced BOOLEAN DEFAULT FALSE,
      last_sync TIMESTAMP,
      variants INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS creatives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      campaign_id UUID,
      fatigue_score DECIMAL(5,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  await testPool.query(tables);
}

export function getTestPool(): Pool {
  if (!testPool) throw new Error('Test database not initialized. Call initTestDatabase() first.');
  return testPool;
}

export async function cleanupTestDatabase(): Promise<void> {
  if (testPool) {
    await testPool.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await testPool.end();
    testPool = null;
  }
}

export async function truncateAllTables(): Promise<void> {
  if (!testPool) return;
  const tables = [
    'alerts', 'notifications', 'webhooks', 'agent_states', 'killswitch_state',
    'budget_allocations', 'content', 'creatives', 'campaigns', 'sessions',
    'products', 'settings', 'countries', 'users'
  ];
  for (const table of tables) {
    await testPool.query(`TRUNCATE TABLE ${table} CASCADE`).catch(() => {});
  }
}
