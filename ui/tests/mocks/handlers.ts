import { http, HttpResponse } from 'msw';

const API_BASE = '/api';

export const handlers = [
  // Dashboard
  http.get(`${API_BASE}/v1/dashboard/overview`, () =>
    HttpResponse.json({
      kpis: {
        totalRevenue: { value: '2.4M', change: 12.5, trend: 'up', prefix: '$' },
        activeCampaigns: { value: 47, change: 8, trend: 'up' },
        globalROAS: { value: '4.2x', change: 5.3, trend: 'up' },
        activeCountries: { value: 12, change: 2, trend: 'up', suffix: ' markets' },
      },
      revenueChart: [
        { month: 'Jan', revenue: 320000, spend: 80000 },
        { month: 'Feb', revenue: 380000, spend: 95000 },
        { month: 'Mar', revenue: 450000, spend: 110000 },
      ],
      topCountries: [
        { country: 'United States', flag: '🇺🇸', revenue: 850000, pct: 85 },
        { country: 'United Kingdom', flag: '🇬🇧', revenue: 420000, pct: 42 },
      ],
      systemConfidence: [
        { label: 'Market Intelligence', score: 92 },
        { label: 'Budget Optimization', score: 88 },
      ],
      overallConfidence: 87,
    })
  ),

  // Campaigns
  http.get(`${API_BASE}/v1/campaigns`, () =>
    HttpResponse.json([
      { id: '1', name: 'Summer Sale US', platform: 'google', country: 'US', status: 'active', budget: 50000, spent: 32000, impressions: 1200000, clicks: 45000, conversions: 1200, roas: 4.2, cpc: 0.71, ctr: 0.0375 },
      { id: '2', name: 'Brand Awareness UK', platform: 'meta', country: 'GB', status: 'active', budget: 30000, spent: 18000, impressions: 800000, clicks: 28000, conversions: 650, roas: 3.8, cpc: 0.64, ctr: 0.035 },
    ])
  ),

  http.get(`${API_BASE}/v1/campaigns/spend/summary`, () =>
    HttpResponse.json({
      channels: [
        { channel: 'Google Ads', spend: 120000, revenue: 480000 },
        { channel: 'Meta Ads', spend: 85000, revenue: 310000 },
        { channel: 'TikTok Ads', spend: 45000, revenue: 180000 },
      ],
    })
  ),

  // Agents
  http.get(`${API_BASE}/v1/agents`, () =>
    HttpResponse.json(
      ['Market Intelligence', 'Country Strategy', 'Paid Ads', 'Organic Social', 'Content Blog',
       'Creative Generation', 'Analytics', 'Budget Optimization', 'A/B Testing', 'Conversion',
       'Shopify Integration', 'Localization', 'Compliance', 'Competitive Intel', 'Fraud Detection',
       'Brand Consistency', 'Data Engineering', 'Security', 'Revenue Forecasting', 'Orchestrator'
      ].map((name, i) => ({ name, status: i < 16 ? 'active' : 'idle' }))
    )
  ),

  // Alerts
  http.get(`${API_BASE}/v1/alerts`, () =>
    HttpResponse.json([
      { id: '1', type: 'critical', source: 'FraudDetection', message: 'Suspicious click pattern detected', timestamp: new Date().toISOString(), acknowledged: false },
      { id: '2', type: 'warning', source: 'BudgetOptimizer', message: 'Campaign approaching budget limit', timestamp: new Date().toISOString(), acknowledged: false },
    ])
  ),

  // Kill Switch
  http.get(`${API_BASE}/v1/killswitch/status`, () =>
    HttpResponse.json({ global: false, campaigns: false, automation: false, apiKeys: false, countrySpecific: {} })
  ),

  http.post(`${API_BASE}/v1/killswitch/activate`, () => HttpResponse.json({ success: true })),

  // Countries
  http.get(`${API_BASE}/v1/countries`, () =>
    HttpResponse.json([
      { code: 'US', name: 'United States', flag: '🇺🇸', opportunityScore: 92.5, gdp: '$25.5T', internetPenetration: 92, ecommerceAdoption: 78, adCostIndex: 1.0, entryStrategy: 'Direct', status: 'active' },
      { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', opportunityScore: 88.0, gdp: '$3.1T', internetPenetration: 95, ecommerceAdoption: 82, adCostIndex: 0.9, entryStrategy: 'Direct', status: 'active' },
    ])
  ),

  // Settings
  http.get(`${API_BASE}/v1/settings`, () =>
    HttpResponse.json({
      general: { companyName: 'Acme Corp', timezone: 'UTC', currency: 'USD', language: 'en', autonomyMode: 'semi', notificationEmail: 'admin@acme.com' },
      notifications: {
        channels: [
          { channel: 'Email', desc: 'Email notifications', enabled: true },
          { channel: 'Slack', desc: 'Slack messages', enabled: true },
          { channel: 'In-App', desc: 'In-app alerts', enabled: true },
          { channel: 'SMS', desc: 'SMS alerts', enabled: false },
        ],
        thresholds: { roasAlert: 2.0, spendAnomaly: 30, cpcSpike: 50, fraudScore: 80 },
      },
      security: [
        { label: 'Encryption at Rest', desc: 'AES-256 encryption', status: 'Active', ok: true },
        { label: 'Rate Limiting', desc: '100 req/15min', status: 'Active', ok: true },
      ],
      appearance: { theme: 'light', accentColor: '#3b82f6', sidebarPosition: 'left', density: 'comfortable' },
      aiAgents: {
        opus: { maxTokens: 4096, temperature: 0.3, confidenceThreshold: 85, rateLimit: 60 },
        sonnet: { maxTokens: 4096, temperature: 0.5, confidenceThreshold: 75, rateLimit: 120 },
        crossChallenge: { minChallengesPerAgent: 3, challengeFrequency: 'Every cycle', contradictionResolution: 'Auto (highest confidence)' },
      },
    })
  ),

  http.get(`${API_BASE}/v1/settings/api-keys`, () =>
    HttpResponse.json({
      keys: [
        { name: 'Anthropic', service: 'AI Provider', key: 'sk-ant-****...abcd', status: 'active', lastRotated: '2024-01-15' },
        { name: 'Google Ads', service: 'Advertising', key: 'AIza****...xyz', status: 'active', lastRotated: '2024-01-10' },
      ],
    })
  ),

  http.put(`${API_BASE}/v1/settings`, () => HttpResponse.json({ success: true })),
  http.put(`${API_BASE}/v1/settings/api-keys`, () => HttpResponse.json({ success: true })),
  http.put(`${API_BASE}/v1/settings/appearance`, () => HttpResponse.json({ success: true })),

  // Content
  http.get(`${API_BASE}/v1/content`, () =>
    HttpResponse.json([
      { id: '1', title: 'SEO Guide for US Market', type: 'blog', status: 'published', language: 'en', country: 'US', seoScore: 92, publishDate: '2024-01-15' },
    ])
  ),

  // Budget
  http.get(`${API_BASE}/v1/budget/allocations`, () =>
    HttpResponse.json([
      { channel: 'Google Ads', allocated: 50000, spent: 32000, remaining: 18000, roas: 4.2, recommendation: 'increase' },
      { channel: 'Meta Ads', allocated: 35000, spent: 21000, remaining: 14000, roas: 3.6, recommendation: 'maintain' },
    ])
  ),

  // Generic fallback for other endpoints
  http.get(`${API_BASE}/v1/*`, () => HttpResponse.json([])),
  http.post(`${API_BASE}/v1/*`, () => HttpResponse.json({ success: true })),
  http.put(`${API_BASE}/v1/*`, () => HttpResponse.json({ success: true })),
  http.delete(`${API_BASE}/v1/*`, () => HttpResponse.json({ success: true })),
];
