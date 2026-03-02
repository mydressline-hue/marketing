import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export const testUsers = {
  admin: { id: uuidv4(), email: 'admin@test.com', password_hash: '$2a$10$test.hash.admin', role: 'admin' },
  analyst: { id: uuidv4(), email: 'analyst@test.com', password_hash: '$2a$10$test.hash.analyst', role: 'analyst' },
  viewer: { id: uuidv4(), email: 'viewer@test.com', password_hash: '$2a$10$test.hash.viewer', role: 'viewer' },
};

export const testCountries = [
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}', opportunity_score: 92.5, gdp: '$25.5T', internet_penetration: 92.0, ecommerce_adoption: 78.0, ad_cost_index: 1.0, entry_strategy: 'Direct', status: 'active' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', opportunity_score: 88.0, gdp: '$3.1T', internet_penetration: 95.0, ecommerce_adoption: 82.0, ad_cost_index: 0.9, entry_strategy: 'Direct', status: 'active' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', opportunity_score: 85.0, gdp: '$4.3T', internet_penetration: 93.0, ecommerce_adoption: 75.0, ad_cost_index: 0.8, entry_strategy: 'Localized', status: 'active' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', opportunity_score: 80.0, gdp: '$4.2T', internet_penetration: 93.0, ecommerce_adoption: 70.0, ad_cost_index: 1.2, entry_strategy: 'Partnership', status: 'planned' },
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', opportunity_score: 72.0, gdp: '$1.9T', internet_penetration: 81.0, ecommerce_adoption: 55.0, ad_cost_index: 0.4, entry_strategy: 'Digital-first', status: 'research' },
];

export const testCampaigns = Array.from({ length: 10 }, (_, i) => ({
  id: uuidv4(),
  name: `Campaign ${i + 1}`,
  platform: (['google', 'meta', 'tiktok', 'bing', 'snapchat'] as const)[i % 5],
  country: testCountries[i % 5].code,
  status: (['active', 'paused', 'draft', 'completed'] as const)[i % 4],
  budget: 10000 + i * 5000,
  spent: 5000 + i * 2000,
  impressions: 100000 + i * 50000,
  clicks: 5000 + i * 1000,
  conversions: 100 + i * 50,
  roas: 2.5 + (i * 0.3),
  cpc: 0.5 + (i * 0.1),
  ctr: 0.03 + (i * 0.005),
}));

export async function seedTestData(pool: Pool): Promise<void> {
  // Insert users
  for (const user of Object.values(testUsers)) {
    await pool.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [user.id, user.email, user.password_hash, user.role]
    );
  }

  // Insert countries
  for (const country of testCountries) {
    await pool.query(
      `INSERT INTO countries (code, name, flag, opportunity_score, gdp, internet_penetration, ecommerce_adoption, ad_cost_index, entry_strategy, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (code) DO NOTHING`,
      [country.code, country.name, country.flag, country.opportunity_score, country.gdp, country.internet_penetration, country.ecommerce_adoption, country.ad_cost_index, country.entry_strategy, country.status]
    );
  }

  // Insert campaigns
  for (const campaign of testCampaigns) {
    await pool.query(
      `INSERT INTO campaigns (id, name, platform, country, status, budget, spent, impressions, clicks, conversions, roas, cpc, ctr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
      [campaign.id, campaign.name, campaign.platform, campaign.country, campaign.status, campaign.budget, campaign.spent, campaign.impressions, campaign.clicks, campaign.conversions, campaign.roas, campaign.cpc, campaign.ctr]
    );
  }

  // Insert budget allocations
  const channels = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Content Marketing', 'SEO'];
  for (const channel of channels) {
    await pool.query(
      `INSERT INTO budget_allocations (channel, allocated, spent, remaining, roas, recommendation) VALUES ($1, $2, $3, $4, $5, $6)`,
      [channel, 50000, 25000, 25000, 3.2, 'maintain']
    );
  }

  // Insert agent states
  const agents = ['MarketIntelligence', 'CountryStrategy', 'PaidAds', 'OrganicSocial', 'ContentBlog',
    'CreativeGeneration', 'Analytics', 'BudgetOptimization', 'ABTesting', 'Conversion',
    'ShopifyIntegration', 'Localization', 'Compliance', 'CompetitiveIntel', 'FraudDetection',
    'BrandConsistency', 'DataEngineering', 'Security', 'RevenueForecasting', 'Orchestrator'];
  for (const agent of agents) {
    await pool.query(
      `INSERT INTO agent_states (agent_name, status, confidence, tasks_completed, tasks_pending) VALUES ($1, $2, $3, $4, $5)`,
      [agent, 'active', 85.0, 100, 5]
    );
  }
}

export async function cleanupSeedData(pool: Pool): Promise<void> {
  const tables = ['alerts', 'notifications', 'webhooks', 'agent_states', 'killswitch_state',
    'budget_allocations', 'content', 'creatives', 'campaigns', 'sessions', 'products', 'settings', 'countries', 'users'];
  for (const table of tables) {
    await pool.query(`DELETE FROM ${table}`).catch(() => {});
  }
}
