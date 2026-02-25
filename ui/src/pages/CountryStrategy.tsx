import { useState } from 'react';
import {
  Target,
  ChevronDown,
  Globe2,
  TrendingUp,
  Users,
  MessageSquare,
} from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import ProgressBar from '../components/shared/ProgressBar';

/* -------------------------------------------------------------------------- */
/*                                 MOCK DATA                                  */
/* -------------------------------------------------------------------------- */

type CountryCode = 'US' | 'UK' | 'DE' | 'JP' | 'AE' | 'AU';

interface Competitor {
  name: string;
  share: number;
  status: string;
}

interface Phase {
  name: string;
  timeline: string;
  description: string;
  status: string;
}

interface CountryData {
  label: string;
  flag: string;
  overview: {
    positioning: string;
    culturalTone: string;
    priceSensitivity: 'low' | 'medium' | 'high';
    messagingStyle: string;
  };
  platformMix: { platform: string; allocation: number }[];
  culturalInsights: string[];
  competitors: Competitor[];
  entryPhases: Phase[];
  confidence: number;
  radarData: { axis: string; value: number }[];
  blueprintActions: string[];
}

const countryData: Record<CountryCode, CountryData> = {
  US: {
    label: 'United States',
    flag: '\u{1F1FA}\u{1F1F8}',
    overview: {
      positioning: 'Innovation leader with premium tech-forward branding',
      culturalTone: 'Bold, aspirational, results-driven',
      priceSensitivity: 'low',
      messagingStyle: 'Direct value propositions with social proof',
    },
    platformMix: [
      { platform: 'Google', allocation: 35 },
      { platform: 'Meta', allocation: 28 },
      { platform: 'TikTok', allocation: 18 },
      { platform: 'Bing', allocation: 10 },
      { platform: 'Snap', allocation: 9 },
    ],
    culturalInsights: [
      'Consumers respond strongly to "limited-time" and urgency-driven campaigns',
      'Influencer partnerships drive 3.2x higher engagement than brand-only content',
      'Mobile-first browsing accounts for 68% of e-commerce traffic',
      'Sustainability messaging resonates with 18-34 demographic segment',
    ],
    competitors: [
      { name: 'Acme Corp', share: 24, status: 'active' },
      { name: 'Zenith Digital', share: 18, status: 'active' },
      { name: 'NovaBrand Co', share: 14, status: 'warning' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-3', description: 'Brand awareness campaigns on Google & Meta with influencer seeding', status: 'completed' },
      { name: 'Growth', timeline: 'Months 4-8', description: 'Scale paid acquisition, launch TikTok campaigns, retargeting funnels', status: 'in_progress' },
      { name: 'Scale', timeline: 'Months 9-12', description: 'Full-funnel optimization, loyalty programs, expand to Snap & Bing', status: 'planned' },
    ],
    confidence: 87,
    radarData: [
      { axis: 'Brand Fit', value: 90 },
      { axis: 'Market Size', value: 95 },
      { axis: 'Competition', value: 60 },
      { axis: 'Regulation', value: 75 },
      { axis: 'Growth Potential', value: 85 },
      { axis: 'Cost Efficiency', value: 65 },
    ],
    blueprintActions: [
      'Prioritize Google Search and Meta retargeting for high-intent traffic',
      'Allocate 15% of budget to TikTok creator partnerships',
      'Implement localized landing pages optimized for US English',
      'Launch A/B testing on value proposition messaging within first 30 days',
    ],
  },
  UK: {
    label: 'United Kingdom',
    flag: '\u{1F1EC}\u{1F1E7}',
    overview: {
      positioning: 'Trusted, quality-conscious brand with understated sophistication',
      culturalTone: 'Witty, understated, trust-oriented',
      priceSensitivity: 'medium',
      messagingStyle: 'Subtle humor with emphasis on value and reliability',
    },
    platformMix: [
      { platform: 'Google', allocation: 38 },
      { platform: 'Meta', allocation: 26 },
      { platform: 'TikTok', allocation: 16 },
      { platform: 'Bing', allocation: 12 },
      { platform: 'Snap', allocation: 8 },
    ],
    culturalInsights: [
      'British consumers value transparency and dislike overt hard-sell tactics',
      'Tea-time browsing peaks (3-5 PM) drive 22% higher CTR on social ads',
      'Loyalty schemes and rewards programs are expected by 74% of shoppers',
      'GDPR compliance messaging increases trust scores by 18%',
    ],
    competitors: [
      { name: 'BritMark Ltd', share: 22, status: 'active' },
      { name: 'Thames Digital', share: 16, status: 'active' },
      { name: 'Crown Media', share: 11, status: 'active' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-3', description: 'Establish brand trust via Google Search and PR partnerships', status: 'completed' },
      { name: 'Growth', timeline: 'Months 4-8', description: 'Expand into Meta and TikTok; loyalty program rollout', status: 'in_progress' },
      { name: 'Scale', timeline: 'Months 9-12', description: 'Omni-channel integration with retail partners, affiliate network', status: 'planned' },
    ],
    confidence: 82,
    radarData: [
      { axis: 'Brand Fit', value: 85 },
      { axis: 'Market Size', value: 78 },
      { axis: 'Competition', value: 65 },
      { axis: 'Regulation', value: 70 },
      { axis: 'Growth Potential', value: 75 },
      { axis: 'Cost Efficiency', value: 72 },
    ],
    blueprintActions: [
      'Lead with Google Search capturing high commercial-intent queries',
      'Develop UK-specific creative with British cultural references',
      'Launch loyalty and rewards program by month 4',
      'Establish PR partnerships with UK digital media outlets',
    ],
  },
  DE: {
    label: 'Germany',
    flag: '\u{1F1E9}\u{1F1EA}',
    overview: {
      positioning: 'Engineering excellence with data-backed performance claims',
      culturalTone: 'Precise, factual, quality-focused',
      priceSensitivity: 'medium',
      messagingStyle: 'Detailed specifications, certifications, and proof points',
    },
    platformMix: [
      { platform: 'Google', allocation: 42 },
      { platform: 'Meta', allocation: 24 },
      { platform: 'TikTok', allocation: 12 },
      { platform: 'Bing', allocation: 14 },
      { platform: 'Snap', allocation: 8 },
    ],
    culturalInsights: [
      'German consumers expect detailed product specifications and certifications',
      'Privacy is paramount -- explicit consent messaging is non-negotiable',
      'Desktop usage remains at 52%, higher than most European markets',
      'Direct comparison with competitors is viewed positively when fact-based',
    ],
    competitors: [
      { name: 'DeutschTech AG', share: 26, status: 'active' },
      { name: 'BerlinBrand GmbH', share: 19, status: 'active' },
      { name: 'Rhein Digital', share: 13, status: 'warning' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-4', description: 'Establish credibility via Google Ads and industry certifications', status: 'in_progress' },
      { name: 'Growth', timeline: 'Months 5-9', description: 'Expand to Meta with localized German content, B2B outreach', status: 'planned' },
      { name: 'Scale', timeline: 'Months 10-14', description: 'Full market penetration, DACH region expansion', status: 'planned' },
    ],
    confidence: 76,
    radarData: [
      { axis: 'Brand Fit', value: 70 },
      { axis: 'Market Size', value: 82 },
      { axis: 'Competition', value: 55 },
      { axis: 'Regulation', value: 60 },
      { axis: 'Growth Potential', value: 78 },
      { axis: 'Cost Efficiency', value: 68 },
    ],
    blueprintActions: [
      'Invest heavily in German-language Google Search with long-tail keywords',
      'Obtain and display relevant industry certifications and trust seals',
      'Build landing pages with detailed technical specifications',
      'Prioritize GDPR-compliant tracking and consent management',
    ],
  },
  JP: {
    label: 'Japan',
    flag: '\u{1F1EF}\u{1F1F5}',
    overview: {
      positioning: 'Harmonious blend of technology and craftsmanship',
      culturalTone: 'Respectful, meticulous, aesthetically refined',
      priceSensitivity: 'low',
      messagingStyle: 'Visual storytelling with attention to detail and packaging',
    },
    platformMix: [
      { platform: 'Google', allocation: 30 },
      { platform: 'Meta', allocation: 15 },
      { platform: 'TikTok', allocation: 22 },
      { platform: 'Bing', allocation: 8 },
      { platform: 'Snap', allocation: 25 },
    ],
    culturalInsights: [
      'Visual presentation and packaging quality are as important as the product itself',
      'LINE and local platforms often outperform global social networks',
      'Seasonal campaigns aligned with Japanese holidays drive 40% higher engagement',
      'Endorsements from local celebrities generate significantly higher trust than global influencers',
    ],
    competitors: [
      { name: 'Sakura Digital', share: 28, status: 'active' },
      { name: 'Tokyo Media Corp', share: 21, status: 'active' },
      { name: 'Nippon Ads', share: 15, status: 'active' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-4', description: 'Localize brand identity, partner with Japanese distributors', status: 'planned' },
      { name: 'Growth', timeline: 'Months 5-10', description: 'Launch campaigns on TikTok and LINE, seasonal activations', status: 'planned' },
      { name: 'Scale', timeline: 'Months 11-16', description: 'Omni-channel retail integration, brand ambassador program', status: 'planned' },
    ],
    confidence: 68,
    radarData: [
      { axis: 'Brand Fit', value: 65 },
      { axis: 'Market Size', value: 88 },
      { axis: 'Competition', value: 45 },
      { axis: 'Regulation', value: 72 },
      { axis: 'Growth Potential', value: 82 },
      { axis: 'Cost Efficiency', value: 55 },
    ],
    blueprintActions: [
      'Invest in premium visual design and localized Japanese brand assets',
      'Partner with local distributors and LINE official accounts',
      'Align campaign calendar with Japanese holidays and seasonal events',
      'Hire local creative team for culturally authentic content',
    ],
  },
  AE: {
    label: 'UAE',
    flag: '\u{1F1E6}\u{1F1EA}',
    overview: {
      positioning: 'Luxury-forward brand with exclusive, premium appeal',
      culturalTone: 'Luxurious, exclusive, community-respecting',
      priceSensitivity: 'low',
      messagingStyle: 'Aspirational imagery with exclusivity and VIP positioning',
    },
    platformMix: [
      { platform: 'Google', allocation: 28 },
      { platform: 'Meta', allocation: 32 },
      { platform: 'TikTok', allocation: 20 },
      { platform: 'Bing', allocation: 5 },
      { platform: 'Snap', allocation: 15 },
    ],
    culturalInsights: [
      'Ramadan campaigns require culturally sensitive messaging and adjusted scheduling',
      'Instagram and Snapchat are the dominant discovery platforms for ages 18-35',
      'Arabic and English bilingual campaigns outperform single-language by 35%',
      'Luxury positioning and exclusivity resonate strongly across all demographics',
    ],
    competitors: [
      { name: 'Gulf Digital Group', share: 20, status: 'active' },
      { name: 'Emirates Media', share: 17, status: 'active' },
      { name: 'Desert Storm Ads', share: 12, status: 'warning' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-3', description: 'Premium brand positioning on Meta and Snap with Arabic creative', status: 'in_progress' },
      { name: 'Growth', timeline: 'Months 4-7', description: 'Scale TikTok presence, influencer collaborations, Ramadan campaign', status: 'planned' },
      { name: 'Scale', timeline: 'Months 8-12', description: 'Expand to wider GCC region, loyalty program for VIP segment', status: 'planned' },
    ],
    confidence: 74,
    radarData: [
      { axis: 'Brand Fit', value: 80 },
      { axis: 'Market Size', value: 65 },
      { axis: 'Competition', value: 70 },
      { axis: 'Regulation', value: 68 },
      { axis: 'Growth Potential', value: 88 },
      { axis: 'Cost Efficiency', value: 60 },
    ],
    blueprintActions: [
      'Create bilingual (Arabic/English) creative assets for all campaigns',
      'Plan and pre-schedule Ramadan-specific campaigns 3 months in advance',
      'Focus budget on Meta and Snap for primary audience reach',
      'Develop VIP and exclusivity-focused landing page experiences',
    ],
  },
  AU: {
    label: 'Australia',
    flag: '\u{1F1E6}\u{1F1FA}',
    overview: {
      positioning: 'Authentic, outdoor-lifestyle brand with casual confidence',
      culturalTone: 'Casual, authentic, community-driven',
      priceSensitivity: 'medium',
      messagingStyle: 'Relaxed tone with emphasis on lifestyle and community',
    },
    platformMix: [
      { platform: 'Google', allocation: 36 },
      { platform: 'Meta', allocation: 27 },
      { platform: 'TikTok', allocation: 19 },
      { platform: 'Bing', allocation: 9 },
      { platform: 'Snap', allocation: 9 },
    ],
    culturalInsights: [
      'Australians value authenticity and can quickly detect inauthentic brand messaging',
      'Outdoor and lifestyle imagery outperforms corporate stock photography by 2.8x',
      'Weekend engagement peaks are 25% higher than weekday averages',
      'Environmental and sustainability claims must be substantiated to avoid backlash',
    ],
    competitors: [
      { name: 'Outback Digital', share: 21, status: 'active' },
      { name: 'Southern Cross Media', share: 16, status: 'active' },
      { name: 'Koala Ads', share: 10, status: 'active' },
    ],
    entryPhases: [
      { name: 'Launch', timeline: 'Months 1-3', description: 'Google Search and Meta campaigns with lifestyle creative', status: 'completed' },
      { name: 'Growth', timeline: 'Months 4-8', description: 'TikTok creator program, community events, seasonal campaigns', status: 'in_progress' },
      { name: 'Scale', timeline: 'Months 9-12', description: 'Expand to New Zealand, build affiliate network, loyalty program', status: 'planned' },
    ],
    confidence: 80,
    radarData: [
      { axis: 'Brand Fit', value: 82 },
      { axis: 'Market Size', value: 68 },
      { axis: 'Competition', value: 72 },
      { axis: 'Regulation', value: 78 },
      { axis: 'Growth Potential', value: 74 },
      { axis: 'Cost Efficiency', value: 70 },
    ],
    blueprintActions: [
      'Lead with authentic lifestyle imagery across all ad platforms',
      'Launch TikTok creator partnership program in month 4',
      'Schedule campaigns around Australian summer and major sporting events',
      'Ensure all sustainability claims are fully substantiated with third-party data',
    ],
  },
};

const countries: { code: CountryCode; label: string; flag: string }[] = [
  { code: 'US', label: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'UK', label: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'DE', label: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'JP', label: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'AE', label: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
  { code: 'AU', label: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
];

const sensitivityColors: Record<string, string> = {
  low: 'bg-success-50 text-success-700',
  medium: 'bg-warning-50 text-warning-700',
  high: 'bg-danger-50 text-danger-700',
};

const platformColors: Record<string, string> = {
  Google: '#4285F4',
  Meta: '#1877F2',
  TikTok: '#000000',
  Bing: '#008373',
  Snap: '#FFFC00',
};

/* -------------------------------------------------------------------------- */
/*                               COMPONENT                                    */
/* -------------------------------------------------------------------------- */

export default function CountryStrategy() {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('US');
  const data = countryData[selectedCountry];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Country Strategy"
        subtitle="Brand Positioning & Market Entry Blueprints"
        icon={<Target className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <Globe2 className="w-4 h-4" />
            <span>{countries.length} Markets</span>
          </div>
        }
      />

      {/* Country Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {countries.map((c) => (
          <button
            key={c.code}
            onClick={() => setSelectedCountry(c.code)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              selectedCountry === c.code
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-surface-600 border border-surface-200 hover:border-primary-300 hover:text-primary-600'
            }`}
          >
            <span>{c.flag}</span>
            <span>{c.code}</span>
            {selectedCountry === c.code && (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        ))}
      </div>

      {/* Country name banner */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{data.flag}</span>
        <h2 className="text-lg font-semibold text-surface-900">{data.label}</h2>
        <StatusBadge status={data.entryPhases.find((p) => p.status === 'in_progress') ? 'in_progress' : 'planned'} />
      </div>

      {/* Row 1: Strategy Overview + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy Overview */}
        <Card title="Strategy Overview" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-500 uppercase tracking-wide">
                <Target className="w-3.5 h-3.5" />
                Brand Positioning
              </div>
              <p className="text-sm text-surface-800">{data.overview.positioning}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-500 uppercase tracking-wide">
                <MessageSquare className="w-3.5 h-3.5" />
                Cultural Tone
              </div>
              <p className="text-sm text-surface-800">{data.overview.culturalTone}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-500 uppercase tracking-wide">
                <TrendingUp className="w-3.5 h-3.5" />
                Price Sensitivity
              </div>
              <span
                className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                  sensitivityColors[data.overview.priceSensitivity]
                }`}
              >
                {data.overview.priceSensitivity}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-500 uppercase tracking-wide">
                <Users className="w-3.5 h-3.5" />
                Messaging Style
              </div>
              <p className="text-sm text-surface-800">{data.overview.messagingStyle}</p>
            </div>
          </div>
        </Card>

        {/* Radar Chart - Market Readiness */}
        <Card title="Market Readiness">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 2: Platform Mix + Cultural Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Mix */}
        <Card title="Platform Mix Recommendation" subtitle="Budget allocation by channel">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.platformMix}
                layout="vertical"
                margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  domain={[0, 50]}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  dataKey="platform"
                  type="category"
                  tick={{ fill: '#475569', fontSize: 13 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Allocation']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Bar
                  dataKey="allocation"
                  radius={[0, 6, 6, 0]}
                  barSize={28}
                  fill="#6366f1"
                  label={{ position: 'right', fill: '#475569', fontSize: 12, formatter: (v: number) => `${v}%` }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Cultural Insights */}
        <Card title="Cultural Insights" subtitle="Key market nuances to incorporate">
          <ul className="space-y-4">
            {data.culturalInsights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </span>
                <p className="text-sm text-surface-700 leading-relaxed">{insight}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Row 3: Competitive Landscape + Entry Strategy Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitive Landscape */}
        <Card title="Competitive Landscape" subtitle="Top competitors by market share">
          <div className="space-y-5">
            {data.competitors.map((comp, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-surface-100 text-surface-600 flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-surface-800">{comp.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-surface-700">{comp.share}%</span>
                    <StatusBadge status={comp.status} size="sm" />
                  </div>
                </div>
                <ProgressBar
                  value={comp.share}
                  max={40}
                  color={idx === 0 ? 'danger' : idx === 1 ? 'warning' : 'primary'}
                  size="sm"
                />
              </div>
            ))}
            <div className="pt-3 border-t border-surface-100">
              <div className="flex items-center justify-between text-xs text-surface-500">
                <span>Combined competitor share</span>
                <span className="font-semibold text-surface-700">
                  {data.competitors.reduce((sum, c) => sum + c.share, 0)}%
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Entry Strategy Timeline */}
        <Card title="Entry Strategy Timeline" subtitle="Phased market entry approach">
          <div className="space-y-6">
            {data.entryPhases.map((phase, idx) => (
              <div key={idx} className="relative flex gap-4">
                {/* Vertical connector line */}
                {idx < data.entryPhases.length - 1 && (
                  <div className="absolute left-[15px] top-9 bottom-0 w-px bg-surface-200" />
                )}
                {/* Phase dot */}
                <div
                  className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    phase.status === 'completed'
                      ? 'bg-success-100 text-success-700'
                      : phase.status === 'in_progress'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-surface-100 text-surface-500'
                  }`}
                >
                  {idx + 1}
                </div>
                {/* Phase details */}
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-surface-900">{phase.name}</span>
                    <StatusBadge status={phase.status} size="sm" />
                  </div>
                  <p className="text-xs font-medium text-primary-600 mb-1">{phase.timeline}</p>
                  <p className="text-sm text-surface-600 leading-relaxed">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 4: Confidence Score + Strategic Blueprint */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Confidence Score */}
        <Card title="Strategy Confidence">
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <ConfidenceScore score={data.confidence} size="lg" />
            <p className="text-sm text-surface-500 text-center max-w-[220px]">
              Overall confidence in the {data.label} market entry strategy
            </p>
            <div className="w-full pt-3 border-t border-surface-100 space-y-2">
              {data.radarData.slice(0, 4).map((item) => (
                <div key={item.axis} className="flex items-center justify-between">
                  <span className="text-xs text-surface-500">{item.axis}</span>
                  <span className="text-xs font-semibold text-surface-700">{item.value}/100</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Strategic Blueprint Summary */}
        <Card
          title="Strategic Blueprint"
          subtitle="Recommended actions for market success"
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            {data.blueprintActions.map((action, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg bg-surface-50 border border-surface-100"
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-surface-800 leading-relaxed">{action}</p>
                </div>
                <StatusBadge status="planned" size="sm" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
