import { pool } from '../config/database';
import { generateId, hashPassword } from '../utils/helpers';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

const SEED_PASSWORD = 'GrowthEngine2024!';

const ROLES = [
  {
    name: 'admin',
    permissions: {
      all: true,
      read: true,
      write: true,
      delete: true,
      manage_users: true,
      manage_roles: true,
      manage_campaigns: true,
      manage_creatives: true,
      manage_budget: true,
      manage_analytics: true,
      manage_compliance: true,
      manage_agents: true,
      manage_kill_switch: true,
      export: true,
    },
  },
  {
    name: 'analyst',
    permissions: {
      read: true,
      read_campaigns: true,
      read_analytics: true,
      read_reports: true,
      read_competitors: true,
      read_compliance: true,
      write_reports: true,
      manage_analytics: true,
      export: true,
    },
  },
  {
    name: 'campaign_manager',
    permissions: {
      read: true,
      read_campaigns: true,
      read_analytics: true,
      read_reports: true,
      read_compliance: true,
      manage_campaigns: true,
      manage_creatives: true,
      manage_budget: true,
      export: true,
    },
  },
  {
    name: 'viewer',
    permissions: {
      read: true,
      read_campaigns: true,
      read_analytics: true,
      read_reports: true,
    },
  },
];

const USERS = [
  {
    email: 'admin@aigrowth.io',
    name: 'System Administrator',
    role: 'admin',
  },
  {
    email: 'analyst@aigrowth.io',
    name: 'Data Analyst',
    role: 'analyst',
  },
  {
    email: 'campaigns@aigrowth.io',
    name: 'Campaign Manager',
    role: 'campaign_manager',
  },
  {
    email: 'viewer@aigrowth.io',
    name: 'Dashboard Viewer',
    role: 'viewer',
  },
];

const COUNTRIES = [
  {
    name: 'United States',
    code: 'US',
    region: 'North America',
    language: 'en',
    currency: 'USD',
    timezone: 'America/New_York',
    gdp: 28780000000000.0, // $28.78 trillion (2024 estimate)
    internet_penetration: 92.0,
    ecommerce_adoption: 80.0,
    social_platforms: {
      primary: ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'X'],
      emerging: ['Threads', 'BeReal'],
      market_share: { Facebook: 30, Instagram: 24, TikTok: 20, YouTube: 15, X: 11 },
    },
    ad_costs: {
      cpm_display: 5.0,
      cpm_social: 9.5,
      cpm_video: 13.0,
      cpm_search: 15.0,
      cpc_avg: 1.72,
      currency: 'USD',
    },
    cultural_behavior: {
      preferred_content: 'short-form video, user-generated content, influencer partnerships',
      shopping_behavior: 'mobile-first, comparison shopping, loyalty rewards',
      peak_engagement_hours: '12:00-14:00, 19:00-22:00 EST',
      holiday_seasons: ['Black Friday', 'Cyber Monday', 'Christmas', 'Prime Day', 'Memorial Day'],
      language_nuances: 'casual, conversational, inclusive language preferred',
    },
    opportunity_score: 88.0,
    entry_strategy: 'Saturated market with high competition. Focus on niche targeting, personalization, and performance marketing. Leverage advanced programmatic advertising and first-party data strategies post-cookie deprecation.',
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    region: 'Europe',
    language: 'en',
    currency: 'GBP',
    timezone: 'Europe/London',
    gdp: 3340000000000.0, // $3.34 trillion (2024 estimate)
    internet_penetration: 97.0,
    ecommerce_adoption: 82.0,
    social_platforms: {
      primary: ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn'],
      emerging: ['Threads', 'Snapchat'],
      market_share: { Facebook: 28, Instagram: 25, TikTok: 19, YouTube: 16, LinkedIn: 12 },
    },
    ad_costs: {
      cpm_display: 4.5,
      cpm_social: 8.5,
      cpm_video: 12.0,
      cpm_search: 13.5,
      cpc_avg: 1.55,
      currency: 'GBP',
    },
    cultural_behavior: {
      preferred_content: 'witty and understated humour, editorial content, sustainability messaging',
      shopping_behavior: 'price-conscious, strong click-and-collect culture, BNPL adoption',
      peak_engagement_hours: '12:00-14:00, 18:00-21:00 GMT',
      holiday_seasons: ['Boxing Day', 'Black Friday', 'Christmas', 'Summer Bank Holiday'],
      language_nuances: 'British English spelling, understatement valued, avoid hard-sell tactics',
    },
    opportunity_score: 82.0,
    entry_strategy: 'Mature digital market with high smartphone penetration. GDPR compliance mandatory. Strong opportunity in social commerce and sustainable brand positioning.',
  },
  {
    name: 'Germany',
    code: 'DE',
    region: 'Europe',
    language: 'de',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    gdp: 4590000000000.0, // $4.59 trillion (2024 estimate)
    internet_penetration: 93.0,
    ecommerce_adoption: 74.0,
    social_platforms: {
      primary: ['YouTube', 'Instagram', 'Facebook', 'TikTok', 'LinkedIn'],
      emerging: ['Twitch', 'Threads'],
      market_share: { YouTube: 27, Instagram: 24, Facebook: 22, TikTok: 16, LinkedIn: 11 },
    },
    ad_costs: {
      cpm_display: 4.0,
      cpm_social: 7.0,
      cpm_video: 11.0,
      cpm_search: 12.0,
      cpc_avg: 1.35,
      currency: 'EUR',
    },
    cultural_behavior: {
      preferred_content: 'detailed product information, data-driven claims, quality certifications',
      shopping_behavior: 'privacy-conscious, invoice payment preferred, strong return culture',
      peak_engagement_hours: '12:00-14:00, 19:00-22:00 CET',
      holiday_seasons: ['Christmas Markets season', 'Oktoberfest', 'Easter', 'Black Friday'],
      language_nuances: 'formal tone preferred in B2B, precise and factual claims, Sie vs du context-dependent',
    },
    opportunity_score: 79.0,
    entry_strategy: 'Largest economy in Europe with strong B2B sector. Strict GDPR enforcement and data privacy expectations. Localization in German is essential. Focus on trust signals and detailed product specifications.',
  },
  {
    name: 'France',
    code: 'FR',
    region: 'Europe',
    language: 'fr',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    gdp: 3130000000000.0, // $3.13 trillion (2024 estimate)
    internet_penetration: 92.0,
    ecommerce_adoption: 71.0,
    social_platforms: {
      primary: ['Facebook', 'Instagram', 'YouTube', 'Snapchat', 'TikTok'],
      emerging: ['Threads', 'LinkedIn'],
      market_share: { Facebook: 26, Instagram: 23, YouTube: 20, Snapchat: 17, TikTok: 14 },
    },
    ad_costs: {
      cpm_display: 3.5,
      cpm_social: 6.5,
      cpm_video: 10.0,
      cpm_search: 11.0,
      cpc_avg: 1.20,
      currency: 'EUR',
    },
    cultural_behavior: {
      preferred_content: 'visually rich, lifestyle-oriented, brand storytelling, luxury appeal',
      shopping_behavior: 'brand-loyal, appreciate artisanal quality, Carte Bancaire dominant payment',
      peak_engagement_hours: '12:00-14:00, 20:00-23:00 CET',
      holiday_seasons: ['Soldes (January/July)', 'French Days', 'Christmas', 'Bastille Day'],
      language_nuances: 'French-language content mandatory for ads, Loi Toubon compliance, formal vouvoiement in marketing',
    },
    opportunity_score: 76.0,
    entry_strategy: 'Strong consumer market with emphasis on brand aesthetics and storytelling. French language content is legally required for advertising. Snapchat has unusually high market share. Focus on lifestyle branding and visual content.',
  },
  {
    name: 'Canada',
    code: 'CA',
    region: 'North America',
    language: 'en',
    currency: 'CAD',
    timezone: 'America/Toronto',
    gdp: 2140000000000.0, // $2.14 trillion (2024 estimate)
    internet_penetration: 96.0,
    ecommerce_adoption: 77.0,
    social_platforms: {
      primary: ['Facebook', 'Instagram', 'YouTube', 'TikTok', 'LinkedIn'],
      emerging: ['Threads', 'Reddit'],
      market_share: { Facebook: 29, Instagram: 23, YouTube: 19, TikTok: 17, LinkedIn: 12 },
    },
    ad_costs: {
      cpm_display: 4.0,
      cpm_social: 7.5,
      cpm_video: 11.0,
      cpm_search: 12.0,
      cpc_avg: 1.40,
      currency: 'CAD',
    },
    cultural_behavior: {
      preferred_content: 'bilingual content, multicultural representation, outdoor lifestyle',
      shopping_behavior: 'cross-border US shopping common, free shipping expectations, Interac payments',
      peak_engagement_hours: '12:00-14:00, 19:00-22:00 EST',
      holiday_seasons: ['Boxing Day', 'Black Friday', 'Canada Day', 'Thanksgiving (October)', 'Christmas'],
      language_nuances: 'bilingual English/French required in Quebec, multicultural sensitivity important',
    },
    opportunity_score: 78.0,
    entry_strategy: 'Highly connected population with US-adjacent consumer behavior. Must comply with PIPEDA and Quebec Bill 96 for French language. Bilingual campaigns recommended. Strong opportunity in cross-border commerce.',
  },
  {
    name: 'Australia',
    code: 'AU',
    region: 'Oceania',
    language: 'en',
    currency: 'AUD',
    timezone: 'Australia/Sydney',
    gdp: 1720000000000.0, // $1.72 trillion (2024 estimate)
    internet_penetration: 96.0,
    ecommerce_adoption: 73.0,
    social_platforms: {
      primary: ['Facebook', 'Instagram', 'YouTube', 'TikTok', 'LinkedIn'],
      emerging: ['Threads', 'Snapchat'],
      market_share: { Facebook: 28, Instagram: 25, YouTube: 20, TikTok: 16, LinkedIn: 11 },
    },
    ad_costs: {
      cpm_display: 5.5,
      cpm_social: 8.0,
      cpm_video: 12.0,
      cpm_search: 14.0,
      cpc_avg: 1.60,
      currency: 'AUD',
    },
    cultural_behavior: {
      preferred_content: 'authentic, casual tone, outdoor lifestyle, sustainability focus',
      shopping_behavior: 'mobile-savvy, Afterpay/BNPL adoption high, seasonal inversion (Southern Hemisphere)',
      peak_engagement_hours: '12:00-14:00, 19:00-22:00 AEST',
      holiday_seasons: ['Boxing Day', 'Click Frenzy', 'Christmas (summer)', 'EOFY Sales (June)'],
      language_nuances: 'Australian English, informal and direct tone, avoidance of overly American phrasing',
    },
    opportunity_score: 75.0,
    entry_strategy: 'Affluent, digitally-savvy market with inverted seasons. High BNPL adoption creates opportunities. Strict Privacy Act compliance. Geographic isolation means shipping costs are a key consideration. Strong social commerce growth.',
  },
  {
    name: 'Japan',
    code: 'JP',
    region: 'Asia-Pacific',
    language: 'ja',
    currency: 'JPY',
    timezone: 'Asia/Tokyo',
    gdp: 4230000000000.0, // $4.23 trillion (2024 estimate)
    internet_penetration: 93.0,
    ecommerce_adoption: 75.0,
    social_platforms: {
      primary: ['LINE', 'YouTube', 'X', 'Instagram', 'TikTok'],
      emerging: ['Threads', 'Note'],
      market_share: { LINE: 30, YouTube: 24, X: 20, Instagram: 16, TikTok: 10 },
    },
    ad_costs: {
      cpm_display: 3.5,
      cpm_social: 6.0,
      cpm_video: 10.0,
      cpm_search: 12.5,
      cpc_avg: 1.10,
      currency: 'JPY',
      note: 'CPM values in USD equivalent for comparison',
    },
    cultural_behavior: {
      preferred_content: 'cute (kawaii) aesthetics, detailed product specs, manga/anime-style visuals, seasonal themes',
      shopping_behavior: 'cash-on-delivery still common, convenience store pickup (konbini), Rakuten ecosystem strong',
      peak_engagement_hours: '12:00-14:00, 21:00-24:00 JST',
      holiday_seasons: ['New Year (Oshogatsu)', 'Golden Week', 'Obon', 'Christmas Eve'],
      language_nuances: 'Japanese-only content essential, honorific language (keigo) in B2B, katakana for foreign brand names',
    },
    opportunity_score: 80.0,
    entry_strategy: 'Third-largest economy with unique digital ecosystem. LINE is the dominant messaging platform (not WhatsApp/Messenger). Content must be fully localized in Japanese with cultural adaptation. X (Twitter) has unusually high usage. Mobile commerce dominates.',
  },
  {
    name: 'South Korea',
    code: 'KR',
    region: 'Asia-Pacific',
    language: 'ko',
    currency: 'KRW',
    timezone: 'Asia/Seoul',
    gdp: 1710000000000.0, // $1.71 trillion (2024 estimate)
    internet_penetration: 98.0,
    ecommerce_adoption: 85.0,
    social_platforms: {
      primary: ['KakaoTalk', 'YouTube', 'Instagram', 'Naver', 'TikTok'],
      emerging: ['Threads', 'Zepeto'],
      market_share: { KakaoTalk: 28, YouTube: 24, Instagram: 20, Naver: 18, TikTok: 10 },
    },
    ad_costs: {
      cpm_display: 3.0,
      cpm_social: 5.5,
      cpm_video: 9.0,
      cpm_search: 11.0,
      cpc_avg: 0.95,
      currency: 'KRW',
      note: 'CPM values in USD equivalent for comparison',
    },
    cultural_behavior: {
      preferred_content: 'K-culture aligned, fast-moving trends, influencer (KOL) driven, live commerce',
      shopping_behavior: 'fastest mobile commerce adoption globally, Coupang dominance, quick delivery expectations',
      peak_engagement_hours: '12:00-14:00, 20:00-24:00 KST',
      holiday_seasons: ['Chuseok', 'Lunar New Year', 'Pepero Day', 'Black Friday'],
      language_nuances: 'Korean-only content essential, honorific speech levels matter, Hangul preferred over Hanja',
    },
    opportunity_score: 83.0,
    entry_strategy: 'Highest internet penetration and e-commerce adoption globally. Unique platform ecosystem (Kakao, Naver). Live commerce is mainstream. Must comply with PIPA data protection. K-culture influences global trends - strong export potential for insights.',
  },
  {
    name: 'Brazil',
    code: 'BR',
    region: 'Latin America',
    language: 'pt',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    gdp: 2170000000000.0, // $2.17 trillion (2024 estimate)
    internet_penetration: 84.0,
    ecommerce_adoption: 55.0,
    social_platforms: {
      primary: ['WhatsApp', 'Instagram', 'YouTube', 'Facebook', 'TikTok'],
      emerging: ['Kwai', 'Telegram'],
      market_share: { WhatsApp: 30, Instagram: 24, YouTube: 20, Facebook: 15, TikTok: 11 },
    },
    ad_costs: {
      cpm_display: 1.5,
      cpm_social: 3.0,
      cpm_video: 5.0,
      cpm_search: 6.5,
      cpc_avg: 0.45,
      currency: 'BRL',
      note: 'CPM values in USD equivalent for comparison',
    },
    cultural_behavior: {
      preferred_content: 'emotional storytelling, music-driven, community-oriented, carnival spirit',
      shopping_behavior: 'installment payments (parcelamento) critical, PIX instant payments, Mercado Livre ecosystem',
      peak_engagement_hours: '12:00-14:00, 19:00-23:00 BRT',
      holiday_seasons: ['Carnival', 'Black Friday (huge)', "Mother's Day", 'Christmas', "Children's Day"],
      language_nuances: 'Brazilian Portuguese (not European Portuguese), informal tu/voce varies by region, local slang important',
    },
    opportunity_score: 72.0,
    entry_strategy: 'Largest Latin American market with massive social media engagement. WhatsApp is primary communication and commerce channel. LGPD compliance required. Installment payment support is essential for conversion. High growth potential despite economic volatility.',
  },
  {
    name: 'Mexico',
    code: 'MX',
    region: 'Latin America',
    language: 'es',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    gdp: 1470000000000.0, // $1.47 trillion (2024 estimate)
    internet_penetration: 77.0,
    ecommerce_adoption: 45.0,
    social_platforms: {
      primary: ['WhatsApp', 'Facebook', 'YouTube', 'Instagram', 'TikTok'],
      emerging: ['Kwai', 'Telegram'],
      market_share: { WhatsApp: 28, Facebook: 26, YouTube: 20, Instagram: 15, TikTok: 11 },
    },
    ad_costs: {
      cpm_display: 1.0,
      cpm_social: 2.5,
      cpm_video: 4.0,
      cpm_search: 5.5,
      cpc_avg: 0.35,
      currency: 'MXN',
      note: 'CPM values in USD equivalent for comparison',
    },
    cultural_behavior: {
      preferred_content: 'family-centric messaging, humor, vibrant visuals, regional identity pride',
      shopping_behavior: 'cash-on-delivery still significant, OXXO convenience store payments, Mercado Libre growth',
      peak_engagement_hours: '13:00-15:00, 20:00-23:00 CST',
      holiday_seasons: ['Buen Fin', 'Dia de Muertos', 'Christmas/Navidad', "Mother's Day (May 10)", 'Hot Sale'],
      language_nuances: 'Mexican Spanish (distinct from Spain/Argentina), avoid overly formal European Spanish, local idioms essential',
    },
    opportunity_score: 68.0,
    entry_strategy: 'Fast-growing digital economy with young demographics. WhatsApp commerce is critical. Cash-based payment alternatives needed alongside digital. Strong US-Mexico cross-border opportunity. Regional cultural differences between north and south Mexico.',
  },
  {
    name: 'India',
    code: 'IN',
    region: 'South Asia',
    language: 'hi',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    gdp: 3940000000000.0, // $3.94 trillion (2024 estimate)
    internet_penetration: 52.0,
    ecommerce_adoption: 38.0,
    social_platforms: {
      primary: ['WhatsApp', 'YouTube', 'Instagram', 'Facebook', 'Telegram'],
      emerging: ['Koo', 'ShareChat', 'Moj'],
      market_share: { WhatsApp: 30, YouTube: 25, Instagram: 20, Facebook: 15, Telegram: 10 },
    },
    ad_costs: {
      cpm_display: 0.50,
      cpm_social: 1.50,
      cpm_video: 2.50,
      cpm_search: 3.50,
      cpc_avg: 0.15,
      currency: 'INR',
      note: 'CPM values in USD equivalent for comparison; among the lowest globally',
    },
    cultural_behavior: {
      preferred_content: 'multilingual content, cricket and Bollywood references, value-driven messaging, regional diversity',
      shopping_behavior: 'price-sensitive, UPI payments (Google Pay/PhonePe), Flipkart and Amazon competing, festive shopping peaks',
      peak_engagement_hours: '10:00-12:00, 19:00-23:00 IST',
      holiday_seasons: ['Diwali (biggest)', 'Big Billion Days', 'Great Indian Festival', 'Republic Day Sales', 'Holi'],
      language_nuances: 'Hindi + English (Hinglish) widely accepted, 22 official languages, regional language content increasingly important',
    },
    opportunity_score: 74.0,
    entry_strategy: 'Massive scale opportunity with 1.4B population and rapid digitization. Extremely price-sensitive market with lowest ad costs globally. UPI payments dominate. Must support multilingual content across Hindi, English, and regional languages. IT Act and data localization requirements.',
  },
  {
    name: 'United Arab Emirates',
    code: 'AE',
    region: 'Middle East',
    language: 'ar',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    gdp: 509000000000.0, // $509 billion (2024 estimate)
    internet_penetration: 99.0,
    ecommerce_adoption: 68.0,
    social_platforms: {
      primary: ['WhatsApp', 'Instagram', 'YouTube', 'Snapchat', 'TikTok'],
      emerging: ['Threads', 'LinkedIn'],
      market_share: { WhatsApp: 28, Instagram: 25, YouTube: 20, Snapchat: 15, TikTok: 12 },
    },
    ad_costs: {
      cpm_display: 6.0,
      cpm_social: 10.0,
      cpm_video: 14.0,
      cpm_search: 16.0,
      cpc_avg: 2.00,
      currency: 'AED',
      note: 'CPM values in USD equivalent; premium market with high purchasing power',
    },
    cultural_behavior: {
      preferred_content: 'luxury-oriented, bilingual Arabic/English, premium aesthetics, Ramadan-specific campaigns',
      shopping_behavior: 'high disposable income, luxury brand affinity, noon.com and Amazon.ae, cash on delivery still used',
      peak_engagement_hours: '14:00-16:00, 21:00-01:00 GST (shifts during Ramadan)',
      holiday_seasons: ['Ramadan/Eid al-Fitr', 'Dubai Shopping Festival', 'Eid al-Adha', 'UAE National Day', 'White Friday'],
      language_nuances: 'bilingual Arabic/English market, right-to-left Arabic layouts essential, respect for Islamic values in content',
    },
    opportunity_score: 71.0,
    entry_strategy: 'Premium market with highest internet penetration globally. High CPMs but equally high purchasing power. Bilingual Arabic/English content required. Ramadan is the single biggest commercial period. PDPL compliance required. Gateway to broader GCC market.',
  },
];

const AGENT_TYPES = [
  'market-analyzer',
  'content-creator',
  'ad-optimizer',
  'budget-allocator',
  'trend-detector',
  'competitor-tracker',
  'seo-optimizer',
  'social-scheduler',
  'audience-segmenter',
  'creative-generator',
  'fraud-detector',
  'compliance-checker',
  'translation-manager',
  'ab-test-runner',
  'report-generator',
  'performance-forecaster',
  'sentiment-analyzer',
  'influencer-matcher',
  'pricing-optimizer',
  'orchestrator',
];

const COMPLIANCE_RULES = [
  {
    name: 'GDPR - General Data Protection Regulation',
    regulation: 'GDPR',
    country_code: null, // Applies to all EU countries
    severity: 'critical',
    rule_definition: {
      jurisdiction: 'European Union / EEA',
      effective_date: '2018-05-25',
      data_handling: {
        lawful_basis_required: true,
        bases: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'],
        data_minimization: 'Collect only data strictly necessary for the stated purpose',
        storage_limitation: 'Personal data must not be kept longer than necessary for its purpose',
        right_to_erasure: 'Users can request deletion of all personal data (right to be forgotten)',
        data_portability: 'Users can request their data in a machine-readable format',
        breach_notification: 'Supervisory authority must be notified within 72 hours of a data breach',
      },
      consent_requirements: {
        explicit_opt_in: true,
        pre_ticked_boxes_allowed: false,
        granular_consent: 'Separate consent required for each distinct processing purpose',
        withdrawal: 'Must be as easy to withdraw consent as to give it',
        age_of_consent: 16,
        parental_consent_required: true,
        records: 'Must maintain auditable records of all consent given',
      },
      ad_restrictions: {
        profiling_transparency: 'Users must be informed about automated profiling and its consequences',
        cross_border_transfers: 'Data transfers outside EU/EEA require adequacy decisions or SCCs',
        cookie_consent: 'Prior consent required for non-essential cookies and tracking',
        legitimate_interest_assessment: 'Required for behavioral advertising without consent',
        right_to_object: 'Users can object to processing for direct marketing at any time',
      },
      penalties: {
        max_fine: '4% of annual global turnover or EUR 20 million (whichever is greater)',
        enforcement_body: 'National Data Protection Authorities (DPAs)',
      },
    },
  },
  {
    name: 'CCPA - California Consumer Privacy Act',
    regulation: 'CCPA',
    country_code: 'US',
    severity: 'critical',
    rule_definition: {
      jurisdiction: 'California, United States',
      effective_date: '2020-01-01',
      amended_by: 'CPRA (California Privacy Rights Act) effective 2023-01-01',
      data_handling: {
        right_to_know: 'Consumers can request what personal information is collected, used, shared, or sold',
        right_to_delete: 'Consumers can request deletion of their personal information',
        right_to_correct: 'Consumers can request correction of inaccurate personal information (CPRA)',
        data_minimization: 'Collection must be reasonably necessary and proportionate to the purpose (CPRA)',
        sensitive_personal_information: 'Enhanced protections for SSN, financial info, precise geolocation, race, health data',
      },
      consent_requirements: {
        opt_out_right: 'Consumers have the right to opt out of the sale or sharing of personal information',
        do_not_sell_link: 'Must provide a clear "Do Not Sell or Share My Personal Information" link',
        opt_in_for_minors: 'Opt-in consent required for consumers under 16; parental consent under 13',
        financial_incentive_notice: 'Must explain any financial incentives for data collection',
      },
      ad_restrictions: {
        cross_context_behavioral_advertising: 'Sharing data for behavioral ads is treated as "selling" under CPRA',
        opt_out_of_profiling: 'Consumers can opt out of automated decision-making (CPRA)',
        global_privacy_control: 'Must honor Global Privacy Control (GPC) browser signals',
        service_provider_contracts: 'Written agreements required with all data processors',
      },
      penalties: {
        max_fine: '$7,500 per intentional violation; $2,500 per unintentional violation',
        enforcement_body: 'California Privacy Protection Agency (CPPA)',
        private_right_of_action: 'Consumers can sue for data breaches ($100-$750 per incident)',
      },
    },
  },
  {
    name: 'LGPD - Lei Geral de Protecao de Dados',
    regulation: 'LGPD',
    country_code: 'BR',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'Brazil',
      effective_date: '2020-09-18',
      data_handling: {
        legal_bases: ['consent', 'legitimate_interest', 'contract', 'legal_obligation', 'research', 'credit_protection', 'health', 'public_policy', 'legal_proceedings', 'life_protection'],
        data_minimization: 'Collect only what is pertinent, proportional, and not excessive',
        purpose_limitation: 'Data must be used only for legitimate, specific, and explicit purposes',
        right_to_access: 'Data subjects can request access to their data at any time',
        right_to_deletion: 'Data subjects can request elimination of unnecessary or excessive data',
        data_protection_officer: 'DPO appointment mandatory',
      },
      consent_requirements: {
        explicit_consent: true,
        written_or_equivalent: 'Consent must be provided in writing or by other means demonstrating the will of the data subject',
        specific_purpose: 'Consent must be tied to a specific processing purpose',
        revocation: 'Data subjects may revoke consent at any time via a simple, free procedure',
        children: 'Specific parental consent required for processing data of children under 12',
      },
      ad_restrictions: {
        profiling_review: 'Data subjects can request review of automated decisions, including profiling',
        international_transfers: 'Only to countries with adequate data protection or with specific safeguards',
        anonymization: 'Anonymized data is outside LGPD scope if it cannot be reversed',
      },
      penalties: {
        max_fine: '2% of revenue in Brazil, up to BRL 50 million per violation',
        enforcement_body: 'ANPD (Autoridade Nacional de Protecao de Dados)',
      },
    },
  },
  {
    name: 'PIPA - Personal Information Protection Act',
    regulation: 'PIPA',
    country_code: 'KR',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'South Korea',
      effective_date: '2011-09-30',
      amended: '2023 amendments for AI and automated processing',
      data_handling: {
        consent_required: 'Prior consent required for collection, use, and transfer of personal information',
        purpose_specification: 'Must specify the purpose at the time of collection',
        retention_limits: 'Must destroy personal information when retention period expires or purpose is achieved',
        pseudonymized_data: 'May be processed for statistical, research, or archival purposes without consent',
        right_to_access: 'Data subjects have the right to access, correct, and delete their information',
        data_protection_officer: 'Mandatory for organizations processing data above thresholds',
      },
      consent_requirements: {
        separate_consent: 'Consent for marketing and third-party sharing must be obtained separately',
        clear_notification: 'Must clearly inform data subjects of purpose, items collected, and retention period',
        withdrawal: 'Data subjects may withdraw consent at any time',
        sensitive_information: 'Separate explicit consent for health, biometric, race, political opinion data',
        children: 'Consent of legal guardian required for children under 14',
      },
      ad_restrictions: {
        opt_out_marketing: 'Must provide easy opt-out mechanism for marketing communications',
        automated_decisions: 'Data subjects can refuse decisions based solely on automated processing',
        cross_border_transfers: 'Requires consent or certification for international data transfers',
        behavioral_tracking: 'Online tracking for targeted ads requires clear disclosure and opt-out',
      },
      penalties: {
        max_fine: 'Up to 3% of relevant revenue or KRW 600 million',
        criminal_penalties: 'Imprisonment up to 5 years for serious violations',
        enforcement_body: 'Personal Information Protection Commission (PIPC)',
      },
    },
  },
  {
    name: 'APPI - Act on Protection of Personal Information',
    regulation: 'APPI',
    country_code: 'JP',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'Japan',
      effective_date: '2005-04-01',
      amended: '2022 amendments strengthened individual rights and penalties',
      data_handling: {
        purpose_specification: 'Purpose of use must be specified as concretely as possible',
        purpose_limitation: 'Personal information must not be used beyond the specified purpose without consent',
        accurate_and_updated: 'Must keep personal data accurate and up to date',
        security_measures: 'Necessary and appropriate measures to prevent leakage, loss, or damage',
        right_to_disclosure: 'Individuals can request disclosure of their retained personal data',
        right_to_correction: 'Individuals can request correction of inaccurate data',
        right_to_deletion: 'Individuals can request cessation of use or deletion if data is no longer needed',
        breach_notification: 'Mandatory reporting to PPC and notification to affected individuals for qualifying breaches',
      },
      consent_requirements: {
        opt_in_for_sensitive: 'Explicit consent required for special care-required personal information (race, religion, medical, criminal)',
        third_party_provision: 'Prior consent required before providing personal data to third parties',
        cross_border_consent: 'Specific consent or conditions required for international transfers',
        pseudonymized_processing: 'Pseudonymized data may be processed internally without consent for new purposes',
      },
      ad_restrictions: {
        cookie_regulation: 'Cookies are not personal data per se, but linking them to personal data triggers APPI',
        behavioral_advertising: 'Must disclose targeting practices; providing data to ad platforms may require consent',
        telemarketing: 'Must identify caller and purpose; must cease upon request',
        email_marketing: 'Opt-in consent required under Act on Regulation of Transmission of Specified Electronic Mail',
      },
      penalties: {
        max_fine: 'JPY 100 million for corporations; JPY 1 million or 1 year imprisonment for individuals',
        enforcement_body: 'Personal Information Protection Commission (PPC)',
      },
    },
  },
  {
    name: 'Privacy Act 1988 (Australia)',
    regulation: 'Privacy Act',
    country_code: 'AU',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'Australia',
      effective_date: '1988-12-14',
      amended: 'Privacy Legislation Amendment (Enforcement and Other Measures) Act 2022 increased penalties',
      data_handling: {
        australian_privacy_principles: 'Governed by 13 Australian Privacy Principles (APPs)',
        collection_limitation: 'Must only collect personal information that is reasonably necessary (APP 3)',
        use_and_disclosure: 'Must only use or disclose for the primary purpose of collection, or a related secondary purpose (APP 6)',
        data_quality: 'Must take reasonable steps to ensure data is accurate, up to date, and complete (APP 10)',
        data_security: 'Must take reasonable steps to protect from misuse, interference, loss, and unauthorized access (APP 11)',
        notifiable_data_breaches: 'Mandatory breach notification to OAIC and affected individuals',
        right_to_access: 'Individuals can request access to their personal information (APP 12)',
        right_to_correction: 'Individuals can request correction of inaccurate data (APP 13)',
      },
      consent_requirements: {
        informed_consent: 'Must provide clear, up-to-date privacy policy (APP 1)',
        notice_of_collection: 'Must notify individuals of collection, purpose, and disclosure practices (APP 5)',
        sensitive_information: 'Consent required for sensitive information (health, biometric, racial, political, sexual orientation)',
        cross_border_disclosure: 'Must take reasonable steps to ensure overseas recipients comply with APPs (APP 8)',
        direct_marketing_opt_out: 'Must provide opt-out mechanism for direct marketing (APP 7)',
      },
      ad_restrictions: {
        spam_act_2003: 'Commercial electronic messages require consent and must include unsubscribe facility',
        do_not_call_register: 'Must check Do Not Call Register before telemarketing',
        targeted_advertising: 'Under proposed reforms, targeted advertising to children may face restrictions',
        online_privacy_code: 'Proposed binding Online Privacy Code for social media and data brokers',
      },
      penalties: {
        max_fine: 'AUD 50 million, or 3x benefit obtained, or 30% of domestic turnover (whichever greatest)',
        enforcement_body: 'Office of the Australian Information Commissioner (OAIC)',
      },
    },
  },
  {
    name: 'PIPEDA - Personal Information Protection and Electronic Documents Act',
    regulation: 'PIPEDA',
    country_code: 'CA',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'Canada (federal level)',
      effective_date: '2000-04-13',
      note: 'Provinces may have substantially similar legislation (Quebec Law 25, Alberta PIPA, BC PIPA)',
      data_handling: {
        ten_principles: 'Based on 10 fair information principles: accountability, identifying purposes, consent, limiting collection, limiting use/disclosure/retention, accuracy, safeguards, openness, individual access, challenging compliance',
        purpose_limitation: 'Must identify and document purposes before or at time of collection',
        retention_limitation: 'Must destroy, erase, or anonymize data when no longer needed for identified purpose',
        safeguards: 'Must protect personal information with security safeguards appropriate to sensitivity',
        breach_notification: 'Mandatory notification to Privacy Commissioner and affected individuals for real risk of significant harm',
        right_to_access: 'Individuals can request access to their personal information',
      },
      consent_requirements: {
        meaningful_consent: 'Must be informed, freely given, and contextually appropriate',
        express_vs_implied: 'Express consent for sensitive data; implied consent may apply for less sensitive contexts',
        withdrawal: 'Individuals can withdraw consent at any time (subject to legal/contractual obligations)',
        children: 'Must consider capacity of minors to consent; guardian consent for young children',
        no_bundling: 'Consent must not be bundled with terms of service as a condition of service',
      },
      ad_restrictions: {
        casl_compliance: 'Canada Anti-Spam Legislation (CASL) requires express or implied consent for commercial electronic messages',
        unsubscribe_mechanism: 'Must include functional unsubscribe mechanism in all commercial messages',
        behavioral_advertising: 'OPC guidance requires transparency and meaningful opt-out for behavioral advertising',
        cross_border_transfers: 'Must ensure comparable level of protection when transferring data internationally',
      },
      penalties: {
        max_fine: 'CAD 100,000 per violation under PIPEDA; up to CAD 10 million under CASL',
        enforcement_body: 'Office of the Privacy Commissioner of Canada (OPC)',
        note: 'Quebec Law 25 imposes fines up to CAD 25 million or 4% of worldwide turnover',
      },
    },
  },
  {
    name: 'IT Act - Information Technology Act 2000 (India)',
    regulation: 'IT Act',
    country_code: 'IN',
    severity: 'medium',
    rule_definition: {
      jurisdiction: 'India',
      effective_date: '2000-10-17',
      note: 'Digital Personal Data Protection Act 2023 (DPDPA) is the new comprehensive law, with rules still being finalized',
      data_handling: {
        reasonable_security: 'Section 43A requires bodies corporate to implement reasonable security practices for sensitive personal data',
        sensitive_personal_data: 'Includes password, financial info, health, biometric, sexual orientation (IT Rules 2011)',
        purpose_limitation: 'Must not retain data longer than required for the purpose of collection',
        data_localization: 'DPDPA allows government to restrict transfer of personal data outside India to notified countries',
        consent_required: 'Must obtain written consent via letter, fax, or email before collecting sensitive personal data',
        right_to_access: 'Data providers may review and correct their information',
      },
      consent_requirements: {
        opt_in_required: 'Consent must be obtained before collection of sensitive personal data',
        purpose_specification: 'Must inform data provider of the purpose of collection and intended recipients',
        withdrawal: 'Data providers may withdraw consent; organization must then delete data within reasonable time',
        children_dpdpa: 'DPDPA requires verifiable parental consent for processing data of children under 18',
      },
      ad_restrictions: {
        unsolicited_communications: 'TRAI regulations restrict unsolicited commercial communications (National Do Not Call Registry)',
        email_marketing: 'Must provide opt-out mechanism',
        data_broker_restrictions: 'DPDPA requires significant data fiduciaries to conduct data protection impact assessments',
        cross_border_advertising: 'May be subject to data localization requirements for certain categories',
      },
      penalties: {
        max_fine: 'INR 250 crore (approximately USD 30 million) under DPDPA',
        it_act_penalties: 'Up to INR 5 crore for failure to protect data (Section 43A)',
        enforcement_body: 'Data Protection Board of India (under DPDPA)',
      },
    },
  },
  {
    name: 'PDPL - Personal Data Protection Law (UAE)',
    regulation: 'PDPL',
    country_code: 'AE',
    severity: 'high',
    rule_definition: {
      jurisdiction: 'United Arab Emirates (federal)',
      effective_date: '2022-01-02',
      note: 'DIFC and ADGM free zones have their own separate data protection laws',
      data_handling: {
        lawful_processing: 'Must have a legitimate purpose and legal basis for processing personal data',
        purpose_limitation: 'Personal data must be collected for clear and specific purposes',
        data_minimization: 'Only collect data that is adequate, relevant, and limited to what is necessary',
        accuracy: 'Must ensure personal data is accurate and up to date',
        storage_limitation: 'Must not store data longer than necessary for the stated purpose',
        security_measures: 'Must implement appropriate technical and organizational measures to protect data',
        breach_notification: 'Must notify UAE Data Office of breaches that may harm data subjects',
      },
      consent_requirements: {
        clear_and_explicit: 'Consent must be clear, specific, informed, and unambiguous',
        freely_given: 'Consent must not be a precondition for providing a service unless necessary',
        withdrawal: 'Data subjects can withdraw consent at any time',
        sensitive_data: 'Explicit consent required for health, biometric, genetic, financial, and religious data',
        children: 'Parental consent required for processing data of minors',
      },
      ad_restrictions: {
        direct_marketing: 'Must obtain consent before sending direct marketing communications',
        opt_out: 'Must provide clear and easy opt-out mechanism for marketing',
        cross_border_transfers: 'Data transfers outside UAE require adequacy determination or appropriate safeguards',
        automated_decisions: 'Data subjects have the right not to be subject to decisions based solely on automated processing',
        islamic_content_standards: 'Marketing content must respect local cultural and religious sensitivities',
      },
      penalties: {
        max_fine: 'AED 5 million (approximately USD 1.36 million) for violations',
        enforcement_body: 'UAE Data Office',
        note: 'DIFC Commissioner and ADGM handle violations within their respective free zones',
      },
    },
  },
  {
    name: 'ePrivacy Directive (EU)',
    regulation: 'ePrivacy Directive',
    country_code: null, // Applies to all EU countries
    severity: 'high',
    rule_definition: {
      jurisdiction: 'European Union / EEA',
      effective_date: '2002-07-12',
      amended: 'Directive 2009/136/EC (Cookie Directive); ePrivacy Regulation still in legislative process',
      data_handling: {
        scope: 'Governs privacy in electronic communications (complements GDPR)',
        traffic_data: 'Must be erased or anonymized when no longer needed for transmission, unless consented to for marketing',
        location_data: 'May only be processed when anonymized or with user consent, for each processing instance',
        communication_confidentiality: 'Electronic communications content and metadata are confidential',
        directories: 'Subscribers must give consent before being included in public directories',
      },
      consent_requirements: {
        cookie_consent: 'Prior informed consent required before storing or accessing information on user devices (cookies, pixels, fingerprinting)',
        exceptions: 'Consent not needed for cookies strictly necessary for service delivery or transmission',
        granular_choice: 'Users must be able to accept or reject cookie categories independently',
        consent_renewal: 'Consent should be refreshed periodically; no universal standard but annual common practice',
      },
      ad_restrictions: {
        email_marketing: 'Opt-in consent required for unsolicited electronic marketing (email, SMS, push notifications)',
        soft_opt_in: 'Existing customers may be marketed to for similar products/services with easy opt-out (soft opt-in)',
        caller_identification: 'Marketing calls must display caller identity; must respect opt-out lists',
        spam: 'Sending unsolicited marketing without consent is prohibited',
        tracking: 'Online tracking technologies (pixels, fingerprinting) require same consent as cookies',
      },
      penalties: {
        determined_by: 'Individual EU member states (transposed into national law)',
        examples: 'CNIL (France) fined Google EUR 150 million for cookie consent violations (2022)',
        enforcement_body: 'National telecommunications and data protection authorities',
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedRoles(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding roles...');
  let count = 0;

  for (const role of ROLES) {
    const id = generateId();
    const result = await client.query(
      `INSERT INTO roles (id, name, permissions)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [id, role.name, JSON.stringify(role.permissions)],
    );
    if (result.rowCount && result.rowCount > 0) count++;
  }

  logger.info(`Seeded ${count} roles (${ROLES.length - count} already existed)`);
}

async function seedUsers(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding users...');
  const passwordHash = await hashPassword(SEED_PASSWORD);
  let count = 0;

  for (const user of USERS) {
    const id = generateId();
    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (email) DO NOTHING`,
      [id, user.email, passwordHash, user.name, user.role],
    );
    if (result.rowCount && result.rowCount > 0) count++;
  }

  logger.info(`Seeded ${count} users (${USERS.length - count} already existed)`);
}

async function seedCountries(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding countries...');
  let count = 0;

  for (const country of COUNTRIES) {
    const id = generateId();
    const result = await client.query(
      `INSERT INTO countries (
        id, name, code, region, language, currency, timezone,
        gdp, internet_penetration, ecommerce_adoption,
        social_platforms, ad_costs, cultural_behavior,
        opportunity_score, entry_strategy, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)
      ON CONFLICT (code) DO NOTHING`,
      [
        id,
        country.name,
        country.code,
        country.region,
        country.language,
        country.currency,
        country.timezone,
        country.gdp,
        country.internet_penetration,
        country.ecommerce_adoption,
        JSON.stringify(country.social_platforms),
        JSON.stringify(country.ad_costs),
        JSON.stringify(country.cultural_behavior),
        country.opportunity_score,
        country.entry_strategy,
      ],
    );
    if (result.rowCount && result.rowCount > 0) count++;
  }

  logger.info(`Seeded ${count} countries (${COUNTRIES.length - count} already existed)`);
}

async function seedComplianceRules(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding compliance rules...');
  let count = 0;

  for (const rule of COMPLIANCE_RULES) {
    const id = generateId();

    // Resolve country_id if a country_code is specified
    let countryId: string | null = null;
    if (rule.country_code) {
      const countryResult = await client.query(
        'SELECT id FROM countries WHERE code = $1',
        [rule.country_code],
      );
      if (countryResult.rows.length > 0) {
        countryId = countryResult.rows[0].id;
      }
    }

    const result = await client.query(
      `INSERT INTO compliance_rules (id, name, regulation, country_id, rule_definition, severity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT DO NOTHING`,
      [
        id,
        rule.name,
        rule.regulation,
        countryId,
        JSON.stringify(rule.rule_definition),
        rule.severity,
      ],
    );
    if (result.rowCount && result.rowCount > 0) count++;
  }

  logger.info(`Seeded ${count} compliance rules (${COMPLIANCE_RULES.length - count} already existed)`);
}

async function seedAgentStates(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding agent states...');
  let count = 0;

  for (const agentType of AGENT_TYPES) {
    const id = generateId();
    const result = await client.query(
      `INSERT INTO agent_states (id, agent_type, status, config, metrics)
       VALUES ($1, $2, 'idle', $3, $4)
       ON CONFLICT DO NOTHING`,
      [
        id,
        agentType,
        JSON.stringify({
          enabled: true,
          max_concurrent_tasks: 5,
          timeout_seconds: 300,
          retry_attempts: 3,
        }),
        JSON.stringify({
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
          avg_duration_ms: 0,
        }),
      ],
    );
    if (result.rowCount && result.rowCount > 0) count++;
  }

  logger.info(`Seeded ${count} agent states (${AGENT_TYPES.length - count} already existed)`);
}

async function seedKillSwitchState(client: import('pg').PoolClient): Promise<void> {
  logger.info('Seeding kill switch state...');

  // Only insert if the table is empty (there should be exactly one row)
  const existing = await client.query('SELECT COUNT(*)::int AS cnt FROM kill_switch_state');
  if (existing.rows[0].cnt > 0) {
    logger.info('Kill switch state already exists, skipping');
    return;
  }

  const id = generateId();
  await client.query(
    `INSERT INTO kill_switch_state (
      id, level, is_active, trigger_type, trigger_details,
      affected_countries, affected_campaigns
    ) VALUES ($1, 0, FALSE, 'manual', $2, '[]', '[]')`,
    [
      id,
      JSON.stringify({
        description: 'System initialized in normal operation mode',
        initialized_at: new Date().toISOString(),
      }),
    ],
  );

  logger.info('Seeded kill switch state (level 0, inactive - normal operation)');
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seed(): Promise<void> {
  const startTime = Date.now();
  logger.info('========================================');
  logger.info('AI Growth Engine - Database Seed');
  logger.info('========================================');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Seed in dependency order
    await seedRoles(client);
    await seedUsers(client);
    await seedCountries(client);
    await seedComplianceRules(client);
    await seedAgentStates(client);
    await seedKillSwitchState(client);

    await client.query('COMMIT');

    const duration = Date.now() - startTime;
    logger.info('========================================');
    logger.info(`Seed completed successfully in ${duration}ms`);
    logger.info('========================================');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Seed failed: ${message}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Run directly via: tsx src/seeds/seed.ts
// ---------------------------------------------------------------------------

const isDirectRun =
  require.main === module ||
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed');

if (isDirectRun) {
  seed()
    .then(() => {
      logger.info('Seed script finished. Closing database pool...');
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed script failed:', error);
      pool.end().finally(() => process.exit(1));
    });
}
