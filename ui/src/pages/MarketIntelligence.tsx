import { useState, useMemo } from 'react';
import { Globe, Search, Filter, Download, ArrowUpDown, Play, RefreshCw, Loader2 } from 'lucide-react';
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
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, PageSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

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

interface CountriesResponse {
  countries: CountryData[];
  radarData: RadarDataPoint[];
  insights: MarketInsight[];
}

interface RadarDataPoint {
  dimension: string;
  [country: string]: string | number;
}

interface MarketInsight {
  id: number;
  title: string;
  description: string;
  color: 'emerald' | 'blue' | 'amber' | 'violet';
}

interface AgentExecutionResponse {
  status: string;
  message: string;
  result?: unknown;
}

interface AgentStatusResponse {
  status: string;
  lastRun: string;
  confidence: number;
}

const regions = ['All', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa'];

type SortKey = 'rank' | 'opportunityScore' | 'gdpValue' | 'internetPenetration' | 'ecommerceAdoption' | 'adCostIndex';

function getScoreBadgeClasses(score: number): string {
  if (score >= 85) return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30';
  if (score >= 70) return 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30';
  if (score >= 55) return 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30';
  return 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-500/30';
}

const insightColorMap = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-100 dark:border-emerald-500/30',
    badge: 'bg-emerald-100 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-100 dark:border-blue-500/30',
    badge: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-100 dark:border-amber-500/30',
    badge: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    border: 'border-violet-100 dark:border-violet-500/30',
    badge: 'bg-violet-100 dark:bg-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
};

export default function MarketIntelligence() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Live API calls
  const {
    data: countriesData,
    loading: countriesLoading,
    error: countriesError,
    refetch: refetchCountries,
  } = useApiQuery<CountriesResponse>('/v1/countries');

  const {
    data: agentStatus,
    loading: _agentStatusLoading,
    error: _agentStatusError,
    refetch: refetchAgentStatus,
  } = useApiQuery<AgentStatusResponse>('/v1/agents/market-intelligence');

  const {
    mutate: runAnalysis,
    loading: analysisRunning,
    error: analysisError,
  } = useApiMutation<AgentExecutionResponse>('/v1/agents/market-intelligence/run', { method: 'POST' });

  const handleRunAnalysis = async () => {
    try {
      await runAnalysis();
      refetchCountries();
      refetchAgentStatus();
    } catch {
      // Error is captured in analysisError state
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const countryData = countriesData?.countries ?? [];
  const radarData = countriesData?.radarData ?? [];
  const insights = countriesData?.insights ?? [];

  const filteredAndSorted = useMemo(() => {
    return countryData
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
  }, [countryData, searchQuery, selectedRegion, sortKey, sortDirection]);

  const scatterData = useMemo(() => {
    return countryData.map(c => ({
      country: c.country,
      opportunityScore: c.opportunityScore,
      adCostIndex: c.adCostIndex,
      flag: c.flag,
    }));
  }, [countryData]);

  // Derive top 3 country names for radar legend
  const top3Countries = useMemo(() => {
    return countryData
      .slice()
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 3)
      .map(c => c.country);
  }, [countryData]);

  const radarColors = ['#6366f1', '#10b981', '#f59e0b'];
  const radarLegendColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500'];

  const SortableHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <button
      onClick={() => handleSort(sortField)}
      className="flex items-center gap-1 font-semibold text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-surface-100 transition-colors group"
    >
      {label}
      <ArrowUpDown
        className={`w-3.5 h-3.5 transition-colors ${
          sortKey === sortField ? 'text-primary-600' : 'text-surface-300 dark:text-surface-600 group-hover:text-surface-500'
        }`}
      />
    </button>
  );

  // Full-page loading skeleton
  if (countriesLoading && !countriesData) {
    return <PageSkeleton />;
  }

  // Full-page error state
  if (countriesError && !countriesData) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Global Market Intelligence"
          subtitle="AI-Powered Country Analysis & Opportunity Scoring"
          icon={<Globe className="w-5 h-5" />}
        />
        <Card>
          <ApiErrorDisplay
            error={countriesError}
            onRetry={refetchCountries}
            title="Failed to load market intelligence data"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Market Intelligence"
        subtitle="AI-Powered Country Analysis & Opportunity Scoring"
        icon={<Globe className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            {agentStatus && (
              <span className="text-xs text-surface-500 dark:text-surface-400 mr-2">
                Last run: {agentStatus.lastRun}
              </span>
            )}
            <button
              onClick={handleRunAnalysis}
              disabled={analysisRunning}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analysisRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {analysisRunning ? 'Running Analysis...' : 'Run Analysis'}
            </button>
            <button
              onClick={refetchCountries}
              disabled={countriesLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${countriesLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-200 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-sm font-medium">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        }
      />

      {/* Analysis Error Banner */}
      {analysisError && (
        <ApiErrorDisplay
          error={analysisError}
          onRetry={handleRunAnalysis}
          compact
        />
      )}

      {/* Filter Bar */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500" />
            <input
              type="text"
              placeholder="Search countries, strategies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400 dark:text-surface-500" />
            <select
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              className="px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200"
            >
              {regions.map(region => (
                <option key={region} value={region}>
                  {region === 'All' ? 'All Regions' : region}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-surface-400 dark:text-surface-500" />
            <select
              value={sortKey}
              onChange={e => {
                const key = e.target.value as SortKey;
                setSortKey(key);
                setSortDirection(key === 'rank' ? 'asc' : 'desc');
              }}
              className="px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200"
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
          <div className="flex items-center gap-3 text-xs text-surface-500 dark:text-surface-400">
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
        {countriesLoading && !countryData.length ? (
          <TableSkeleton rows={8} columns={9} />
        ) : filteredAndSorted.length === 0 ? (
          <EmptyState
            title="No markets found"
            message={searchQuery || selectedRegion !== 'All'
              ? 'Try adjusting your search or filter criteria.'
              : 'Run an analysis to populate market data.'}
            icon={<Globe className="w-6 h-6 text-surface-400 dark:text-surface-500" />}
            action={
              !searchQuery && selectedRegion === 'All' ? (
                <button
                  onClick={handleRunAnalysis}
                  disabled={analysisRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  Run Analysis
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-700">
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
                    className="border-b border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-bold text-surface-400 dark:text-surface-500">#{item.rank}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{item.flag}</span>
                        <div>
                          <span className="font-medium text-surface-900 dark:text-surface-100">{item.country}</span>
                          <span className="block text-xs text-surface-400 dark:text-surface-500">{item.region}</span>
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
                      <span className="text-sm text-surface-700 dark:text-surface-200 font-medium">{item.gdp}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${item.internetPenetration}%` }}
                          />
                        </div>
                        <span className="text-sm text-surface-600 dark:text-surface-300">{item.internetPenetration}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${item.ecommerceAdoption}%` }}
                          />
                        </div>
                        <span className="text-sm text-surface-600 dark:text-surface-300">{item.ecommerceAdoption}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-mono text-surface-700 dark:text-surface-200">
                        {item.adCostIndex.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-surface-600 dark:text-surface-300">{item.entryStrategy}</span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter Chart - Opportunity Score vs Ad Cost Index */}
        <Card
          title="Opportunity Score vs. Ad Cost Index"
          subtitle="Higher score + lower cost = best opportunity"
        >
          {countriesLoading && !scatterData.length ? (
            <ChartSkeleton />
          ) : scatterData.length === 0 ? (
            <EmptyState
              title="No chart data"
              message="Run an analysis to generate opportunity data."
            />
          ) : (
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
                          <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-3 shadow-lg">
                            <p className="font-semibold text-surface-900 dark:text-surface-100">
                              {data.flag} {data.country}
                            </p>
                            <p className="text-sm text-surface-600 dark:text-surface-300">
                              Opportunity: <span className="font-medium">{data.opportunityScore}</span>
                            </p>
                            <p className="text-sm text-surface-600 dark:text-surface-300">
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
          )}
        </Card>

        {/* Radar Chart - Top 3 Countries Comparison */}
        <Card
          title="Top 3 Markets Comparison"
          subtitle="Multi-dimensional analysis across 6 key factors"
          actions={
            top3Countries.length > 0 ? (
              <div className="flex items-center gap-3 text-xs">
                {top3Countries.map((name, i) => (
                  <span key={name} className="flex items-center gap-1">
                    <span className={`w-3 h-0.5 ${radarLegendColors[i] || 'bg-surface-400'} rounded`} />
                    {name}
                  </span>
                ))}
              </div>
            ) : undefined
          }
        >
          {countriesLoading && !radarData.length ? (
            <ChartSkeleton />
          ) : radarData.length === 0 ? (
            <EmptyState
              title="No comparison data"
              message="Run an analysis to generate market comparison data."
            />
          ) : (
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
                  {top3Countries.map((name, i) => (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
                      stroke={radarColors[i]}
                      fill={radarColors[i]}
                      fillOpacity={i === 0 ? 0.15 : 0.1}
                      strokeWidth={2}
                    />
                  ))}
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-3 shadow-lg">
                            <p className="font-semibold text-surface-900 dark:text-surface-100 mb-1">{label}</p>
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
          )}
        </Card>
      </div>

      {/* Market Insights */}
      <Card
        title="AI Market Insights"
        subtitle="Key findings from the latest analysis"
      >
        {countriesLoading && !insights.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3 p-4 bg-surface-50 dark:bg-surface-800 rounded-lg border border-surface-100 dark:border-surface-700">
                <div className="w-8 h-8 bg-surface-200 dark:bg-surface-700 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-3/4" />
                  <div className="h-3 bg-surface-200 dark:bg-surface-700 rounded w-full" />
                  <div className="h-3 bg-surface-200 dark:bg-surface-700 rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <EmptyState
            title="No insights available"
            message="Run an analysis to generate AI-powered market insights."
            action={
              <button
                onClick={handleRunAnalysis}
                disabled={analysisRunning}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Run Analysis
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, index) => {
              const colors = insightColorMap[insight.color] || insightColorMap.blue;
              return (
                <div
                  key={insight.id ?? index}
                  className={`flex gap-3 p-4 ${colors.bg} rounded-lg border ${colors.border}`}
                >
                  <div className={`w-8 h-8 ${colors.badge} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <span className={`${colors.text} font-bold text-sm`}>{index + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-surface-900 dark:text-surface-100 text-sm">{insight.title}</p>
                    <p className="text-sm text-surface-600 dark:text-surface-300 mt-1">{insight.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
