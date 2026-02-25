import { useState } from 'react';
import { Globe, Search, Filter, Download, ArrowUpDown } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import DataTable from '../components/shared/DataTable';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import StatusBadge from '../components/shared/StatusBadge';

interface CountryData {
  rank: number;
  country: string;
  flag: string;
  opportunityScore: number;
  gdp: string;
  gdpValue: number;
  internetPenetration: number;
  ecommerceAdoption: number;
  adCostIndex: number;
  entryStrategy: string;
  status: string;
  region: string;
  [key: string]: unknown;
}

const countryData: CountryData[] = [
  {
    rank: 1,
    country: 'United States',
    flag: '\u{1F1FA}\u{1F1F8}',
    opportunityScore: 94,
    gdp: '$25.5T',
    gdpValue: 25500,
    internetPenetration: 92,
    ecommerceAdoption: 87,
    adCostIndex: 1.42,
    entryStrategy: 'Direct Entry',
    status: 'active',
    region: 'Americas',
  },
  {
    rank: 2,
    country: 'United Kingdom',
    flag: '\u{1F1EC}\u{1F1E7}',
    opportunityScore: 89,
    gdp: '$3.1T',
    gdpValue: 3100,
    internetPenetration: 95,
    ecommerceAdoption: 82,
    adCostIndex: 1.18,
    entryStrategy: 'Direct Entry',
    status: 'active',
    region: 'Europe',
  },
  {
    rank: 3,
    country: 'Germany',
    flag: '\u{1F1E9}\u{1F1EA}',
    opportunityScore: 86,
    gdp: '$4.1T',
    gdpValue: 4100,
    internetPenetration: 93,
    ecommerceAdoption: 78,
    adCostIndex: 1.05,
    entryStrategy: 'Local Partnership',
    status: 'active',
    region: 'Europe',
  },
  {
    rank: 4,
    country: 'Japan',
    flag: '\u{1F1EF}\u{1F1F5}',
    opportunityScore: 82,
    gdp: '$4.2T',
    gdpValue: 4200,
    internetPenetration: 91,
    ecommerceAdoption: 75,
    adCostIndex: 0.92,
    entryStrategy: 'Local Partnership',
    status: 'active',
    region: 'Asia',
  },
  {
    rank: 5,
    country: 'Australia',
    flag: '\u{1F1E6}\u{1F1FA}',
    opportunityScore: 80,
    gdp: '$1.7T',
    gdpValue: 1700,
    internetPenetration: 96,
    ecommerceAdoption: 73,
    adCostIndex: 1.08,
    entryStrategy: 'Direct Entry',
    status: 'active',
    region: 'Asia',
  },
  {
    rank: 6,
    country: 'UAE',
    flag: '\u{1F1E6}\u{1F1EA}',
    opportunityScore: 78,
    gdp: '$0.5T',
    gdpValue: 500,
    internetPenetration: 99,
    ecommerceAdoption: 68,
    adCostIndex: 0.87,
    entryStrategy: 'Free Zone Setup',
    status: 'in_progress',
    region: 'Middle East',
  },
  {
    rank: 7,
    country: 'Canada',
    flag: '\u{1F1E8}\u{1F1E6}',
    opportunityScore: 77,
    gdp: '$2.1T',
    gdpValue: 2100,
    internetPenetration: 94,
    ecommerceAdoption: 76,
    adCostIndex: 0.98,
    entryStrategy: 'Direct Entry',
    status: 'active',
    region: 'Americas',
  },
  {
    rank: 8,
    country: 'France',
    flag: '\u{1F1EB}\u{1F1F7}',
    opportunityScore: 75,
    gdp: '$2.8T',
    gdpValue: 2800,
    internetPenetration: 90,
    ecommerceAdoption: 71,
    adCostIndex: 0.95,
    entryStrategy: 'Local Partnership',
    status: 'in_progress',
    region: 'Europe',
  },
  {
    rank: 9,
    country: 'South Korea',
    flag: '\u{1F1F0}\u{1F1F7}',
    opportunityScore: 74,
    gdp: '$1.8T',
    gdpValue: 1800,
    internetPenetration: 97,
    ecommerceAdoption: 84,
    adCostIndex: 0.78,
    entryStrategy: 'Local Partnership',
    status: 'in_progress',
    region: 'Asia',
  },
  {
    rank: 10,
    country: 'Singapore',
    flag: '\u{1F1F8}\u{1F1EC}',
    opportunityScore: 72,
    gdp: '$0.4T',
    gdpValue: 400,
    internetPenetration: 98,
    ecommerceAdoption: 70,
    adCostIndex: 0.82,
    entryStrategy: 'Direct Entry',
    status: 'planned',
    region: 'Asia',
  },
  {
    rank: 11,
    country: 'Brazil',
    flag: '\u{1F1E7}\u{1F1F7}',
    opportunityScore: 65,
    gdp: '$1.9T',
    gdpValue: 1900,
    internetPenetration: 81,
    ecommerceAdoption: 52,
    adCostIndex: 0.48,
    entryStrategy: 'Local Partnership',
    status: 'research',
    region: 'Americas',
  },
  {
    rank: 12,
    country: 'India',
    flag: '\u{1F1EE}\u{1F1F3}',
    opportunityScore: 62,
    gdp: '$3.5T',
    gdpValue: 3500,
    internetPenetration: 52,
    ecommerceAdoption: 38,
    adCostIndex: 0.32,
    entryStrategy: 'Joint Venture',
    status: 'research',
    region: 'Asia',
  },
];

const radarData = [
  { dimension: 'Market Size', US: 95, UK: 72, Germany: 78 },
  { dimension: 'Digital Maturity', US: 90, UK: 92, Germany: 88 },
  { dimension: 'Competition', US: 45, UK: 62, Germany: 65 },
  { dimension: 'Ad Costs', US: 38, UK: 52, Germany: 60 },
  { dimension: 'Growth Potential', US: 70, UK: 68, Germany: 72 },
  { dimension: 'Regulatory Ease', US: 82, UK: 78, Germany: 65 },
];

const regions = ['All', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa'];

type SortKey = 'rank' | 'opportunityScore' | 'gdpValue' | 'internetPenetration' | 'ecommerceAdoption' | 'adCostIndex';

function getScoreBadgeClasses(score: number): string {
  if (score >= 85) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (score >= 70) return 'bg-blue-100 text-blue-800 border border-blue-200';
  if (score >= 55) return 'bg-amber-100 text-amber-800 border border-amber-200';
  return 'bg-red-100 text-red-800 border border-red-200';
}

export default function MarketIntelligence() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const filteredAndSorted = countryData
    .filter(c => {
      const matchesSearch =
        c.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.entryStrategy.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = selectedRegion === 'All' || c.region === selectedRegion;
      return matchesSearch && matchesRegion;
    })
    .sort((a, b) => {
      const aVal = a[sortKey] as number;
      const bVal = b[sortKey] as number;
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    })
    .map((c, i) => ({ ...c, rank: i + 1 }));

  const scatterData = countryData.map(c => ({
    country: c.country,
    opportunityScore: c.opportunityScore,
    adCostIndex: c.adCostIndex,
    flag: c.flag,
  }));

  const SortableHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <button
      onClick={() => handleSort(sortField)}
      className="flex items-center gap-1 font-semibold text-surface-600 hover:text-surface-900 transition-colors group"
    >
      {label}
      <ArrowUpDown
        className={`w-3.5 h-3.5 transition-colors ${
          sortKey === sortField ? 'text-primary-600' : 'text-surface-300 group-hover:text-surface-500'
        }`}
      />
    </button>
  );

  const columns = [
    {
      key: 'rank',
      label: 'Rank',
      className: 'w-16',
      render: (item: CountryData) => (
        <span className="text-sm font-bold text-surface-400">#{item.rank}</span>
      ),
    },
    {
      key: 'country',
      label: 'Country',
      render: (item: CountryData) => (
        <div className="flex items-center gap-2">
          <span className="text-xl">{item.flag}</span>
          <div>
            <span className="font-medium text-surface-900">{item.country}</span>
            <span className="block text-xs text-surface-400">{item.region}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'opportunityScore',
      label: 'Opportunity Score',
      render: (item: CountryData) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${getScoreBadgeClasses(item.opportunityScore)}`}
        >
          {item.opportunityScore}
        </span>
      ),
    },
    {
      key: 'gdpValue',
      label: 'GDP',
      render: (item: CountryData) => (
        <span className="text-sm text-surface-700 font-medium">{item.gdp}</span>
      ),
    },
    {
      key: 'internetPenetration',
      label: 'Internet %',
      render: (item: CountryData) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full"
              style={{ width: `${item.internetPenetration}%` }}
            />
          </div>
          <span className="text-sm text-surface-600">{item.internetPenetration}%</span>
        </div>
      ),
    },
    {
      key: 'ecommerceAdoption',
      label: 'E-commerce %',
      render: (item: CountryData) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{ width: `${item.ecommerceAdoption}%` }}
            />
          </div>
          <span className="text-sm text-surface-600">{item.ecommerceAdoption}%</span>
        </div>
      ),
    },
    {
      key: 'adCostIndex',
      label: 'Ad Cost Index',
      render: (item: CountryData) => (
        <span className="text-sm font-mono text-surface-700">{item.adCostIndex.toFixed(2)}</span>
      ),
    },
    {
      key: 'entryStrategy',
      label: 'Entry Strategy',
      render: (item: CountryData) => (
        <span className="text-sm text-surface-600">{item.entryStrategy}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: CountryData) => <StatusBadge status={item.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Market Intelligence"
        subtitle="AI-Powered Country Analysis & Opportunity Scoring"
        icon={<Globe className="w-5 h-5" />}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search countries, strategies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400" />
            <select
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              className="px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-surface-700"
            >
              {regions.map(region => (
                <option key={region} value={region}>
                  {region === 'All' ? 'All Regions' : region}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-surface-400" />
            <select
              value={sortKey}
              onChange={e => {
                const key = e.target.value as SortKey;
                setSortKey(key);
                setSortDirection(key === 'rank' ? 'asc' : 'desc');
              }}
              className="px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-surface-700"
            >
              <option value="rank">Rank</option>
              <option value="opportunityScore">Opportunity Score</option>
              <option value="gdpValue">GDP</option>
              <option value="internetPenetration">Internet Penetration</option>
              <option value="ecommerceAdoption">E-commerce Adoption</option>
              <option value="adCostIndex">Ad Cost Index</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Country Opportunity Ranking Table */}
      <Card
        title="Country Opportunity Ranking"
        subtitle={`${filteredAndSorted.length} markets analyzed`}
        actions={
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> 85+
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> 70-84
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> 55-69
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> &lt;55
            </span>
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-3 px-4 w-16">
                  <SortableHeader label="#" sortField="rank" />
                </th>
                <th className="text-left py-3 px-4">Country</th>
                <th className="text-left py-3 px-4">
                  <SortableHeader label="Opportunity" sortField="opportunityScore" />
                </th>
                <th className="text-left py-3 px-4">
                  <SortableHeader label="GDP" sortField="gdpValue" />
                </th>
                <th className="text-left py-3 px-4">
                  <SortableHeader label="Internet %" sortField="internetPenetration" />
                </th>
                <th className="text-left py-3 px-4">
                  <SortableHeader label="E-commerce %" sortField="ecommerceAdoption" />
                </th>
                <th className="text-left py-3 px-4">
                  <SortableHeader label="Ad Cost" sortField="adCostIndex" />
                </th>
                <th className="text-left py-3 px-4">Entry Strategy</th>
                <th className="text-left py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map(item => (
                <tr
                  key={item.country}
                  className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="text-sm font-bold text-surface-400">#{item.rank}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.flag}</span>
                      <div>
                        <span className="font-medium text-surface-900">{item.country}</span>
                        <span className="block text-xs text-surface-400">{item.region}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${getScoreBadgeClasses(item.opportunityScore)}`}
                    >
                      {item.opportunityScore}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-surface-700 font-medium">{item.gdp}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${item.internetPenetration}%` }}
                        />
                      </div>
                      <span className="text-sm text-surface-600">{item.internetPenetration}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full"
                          style={{ width: `${item.ecommerceAdoption}%` }}
                        />
                      </div>
                      <span className="text-sm text-surface-600">{item.ecommerceAdoption}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-mono text-surface-700">
                      {item.adCostIndex.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-surface-600">{item.entryStrategy}</span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter Chart - Opportunity Score vs Ad Cost Index */}
        <Card
          title="Opportunity Score vs. Ad Cost Index"
          subtitle="Higher score + lower cost = best opportunity"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="adCostIndex"
                  name="Ad Cost Index"
                  domain={[0, 1.6]}
                  label={{ value: 'Ad Cost Index', position: 'bottom', offset: 0, style: { fontSize: 12, fill: '#6b7280' } }}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis
                  type="number"
                  dataKey="opportunityScore"
                  name="Opportunity Score"
                  domain={[50, 100]}
                  label={{ value: 'Opportunity Score', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 12, fill: '#6b7280' } }}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white border border-surface-200 rounded-lg p-3 shadow-lg">
                          <p className="font-semibold text-surface-900">
                            {data.flag} {data.country}
                          </p>
                          <p className="text-sm text-surface-600">
                            Opportunity: <span className="font-medium">{data.opportunityScore}</span>
                          </p>
                          <p className="text-sm text-surface-600">
                            Ad Cost: <span className="font-medium">{data.adCostIndex}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.7} stroke="#4f46e5" strokeWidth={1} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Radar Chart - Top 3 Countries Comparison */}
        <Card
          title="Top 3 Markets Comparison"
          subtitle="Multi-dimensional analysis across 6 key factors"
          actions={
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-indigo-500 rounded" /> US
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-emerald-500 rounded" /> UK
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-amber-500 rounded" /> Germany
              </span>
            </div>
          }
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                />
                <Radar
                  name="United States"
                  dataKey="US"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Radar
                  name="United Kingdom"
                  dataKey="UK"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Radar
                  name="Germany"
                  dataKey="Germany"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white border border-surface-200 rounded-lg p-3 shadow-lg">
                          <p className="font-semibold text-surface-900 mb-1">{label}</p>
                          {payload.map((entry, i) => (
                            <p key={i} className="text-sm" style={{ color: entry.color }}>
                              {entry.name}: <span className="font-medium">{entry.value}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Market Insights */}
      <Card
        title="AI Market Insights"
        subtitle="Key findings from the latest analysis"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-600 font-bold text-sm">1</span>
            </div>
            <div>
              <p className="font-semibold text-surface-900 text-sm">Highest ROI Opportunity</p>
              <p className="text-sm text-surface-600 mt-1">
                South Korea and Singapore offer the best cost-to-opportunity ratio with ad cost indices below 0.85 while maintaining e-commerce adoption rates above 70%. These markets provide 2.3x better ROI compared to the US market.
              </p>
            </div>
          </div>

          <div className="flex gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 font-bold text-sm">2</span>
            </div>
            <div>
              <p className="font-semibold text-surface-900 text-sm">Emerging Market Potential</p>
              <p className="text-sm text-surface-600 mt-1">
                India and Brazil show the fastest year-over-year growth in digital adoption, with internet penetration increasing 8-12% annually. Early entry into these markets positions for significant long-term gains as infrastructure matures.
              </p>
            </div>
          </div>

          <div className="flex gap-3 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-600 font-bold text-sm">3</span>
            </div>
            <div>
              <p className="font-semibold text-surface-900 text-sm">European Regulatory Landscape</p>
              <p className="text-sm text-surface-600 mt-1">
                GDPR and the Digital Services Act create higher compliance overhead for EU markets. However, local partnership strategies in Germany and France reduce regulatory burden by 40% and accelerate time-to-market by an average of 3 months.
              </p>
            </div>
          </div>

          <div className="flex gap-3 p-4 bg-violet-50 rounded-lg border border-violet-100">
            <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-violet-600 font-bold text-sm">4</span>
            </div>
            <div>
              <p className="font-semibold text-surface-900 text-sm">UAE as a Middle East Gateway</p>
              <p className="text-sm text-surface-600 mt-1">
                The UAE's 99% internet penetration and free zone infrastructure make it the optimal entry point for the broader Middle East and North Africa region. A single UAE presence can efficiently serve a $1.2T combined regional market.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
