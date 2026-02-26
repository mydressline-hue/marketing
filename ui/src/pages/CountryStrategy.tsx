import { useState, useEffect } from 'react';
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
import { useApiQuery } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

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

interface CountryOverview {
  positioning: string;
  culturalTone: string;
  priceSensitivity: 'low' | 'medium' | 'high';
  messagingStyle: string;
}

interface CountryDetail {
  id: string;
  code: string;
  label: string;
  flag: string;
  overview: CountryOverview;
  platformMix: { platform: string; allocation: number }[];
  culturalInsights: string[];
  competitors: Competitor[];
  entryPhases: Phase[];
  confidence: number;
  radarData: { axis: string; value: number }[];
  blueprintActions: string[];
}

interface CountryListItem {
  id: string;
  code: string;
  label: string;
  flag: string;
}

interface CountriesResponse {
  countries: CountryListItem[];
}

interface CountryDetailResponse {
  country: CountryDetail;
}

interface CountryStrategyResponse {
  strategy: CountryDetail;
}

/* -------------------------------------------------------------------------- */
/*                                CONSTANTS                                   */
/* -------------------------------------------------------------------------- */

const sensitivityColors: Record<string, string> = {
  low: 'bg-success-50 text-success-700',
  medium: 'bg-warning-50 text-warning-700',
  high: 'bg-danger-50 text-danger-700',
};

/* -------------------------------------------------------------------------- */
/*                               COMPONENT                                    */
/* -------------------------------------------------------------------------- */

export default function CountryStrategy() {
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);

  // Fetch the countries list
  const {
    data: countriesData,
    loading: countriesLoading,
    error: countriesError,
    refetch: refetchCountries,
  } = useApiQuery<CountriesResponse | CountryListItem[]>('/v1/countries');

  // Normalize: API may return { countries: [...] } or [...]
  const countries: CountryListItem[] = countriesData
    ? Array.isArray(countriesData)
      ? countriesData
      : (countriesData as CountriesResponse).countries ?? []
    : [];

  // Auto-select the first country once loaded
  useEffect(() => {
    if (countries.length > 0 && !selectedCountryId) {
      setSelectedCountryId(countries[0].id ?? countries[0].code);
    }
  }, [countries, selectedCountryId]);

  // Fetch selected country detail + strategy
  const countryEndpoint = selectedCountryId
    ? `/v1/countries/${selectedCountryId}`
    : null;
  const strategyEndpoint = selectedCountryId
    ? `/v1/countries/${selectedCountryId}/strategy`
    : null;

  const {
    data: countryDetailRaw,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useApiQuery<CountryDetailResponse | CountryDetail>(countryEndpoint);

  const {
    data: strategyRaw,
    loading: strategyLoading,
    error: strategyError,
    refetch: refetchStrategy,
  } = useApiQuery<CountryStrategyResponse | CountryDetail>(strategyEndpoint);

  // Normalize detail response
  const countryDetail: CountryDetail | null = countryDetailRaw
    ? (countryDetailRaw as CountryDetailResponse).country ?? (countryDetailRaw as CountryDetail)
    : null;

  // Normalize strategy response - merge with detail if available
  const strategyDetail: CountryDetail | null = strategyRaw
    ? (strategyRaw as CountryStrategyResponse).strategy ?? (strategyRaw as CountryDetail)
    : null;

  // Merge detail and strategy: strategy takes precedence for strategy-specific fields
  const data: CountryDetail | null = countryDetail
    ? {
        ...countryDetail,
        ...(strategyDetail ?? {}),
        // Ensure base identity fields come from detail
        id: countryDetail.id,
        code: countryDetail.code,
        label: countryDetail.label ?? countryDetail.code,
        flag: countryDetail.flag ?? '',
      }
    : strategyDetail;

  const isLoading = countriesLoading || detailLoading || strategyLoading;

  /* ---- Countries list: loading / error / empty ---- */
  if (countriesLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Country Strategy"
          subtitle="Brand Positioning & Market Entry Blueprints"
          icon={<Target className="w-5 h-5" />}
        />
        <CardSkeleton lines={2} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><CardSkeleton lines={4} /></div>
          <ChartSkeleton height="h-56" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton height="h-64" />
          <CardSkeleton lines={4} />
        </div>
      </div>
    );
  }

  if (countriesError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Country Strategy"
          subtitle="Brand Positioning & Market Entry Blueprints"
          icon={<Target className="w-5 h-5" />}
        />
        <Card>
          <ApiErrorDisplay
            error={countriesError}
            onRetry={refetchCountries}
            message="Failed to load countries"
          />
        </Card>
      </div>
    );
  }

  if (countries.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Country Strategy"
          subtitle="Brand Positioning & Market Entry Blueprints"
          icon={<Target className="w-5 h-5" />}
        />
        <Card>
          <EmptyState
            icon={<Globe2 className="w-6 h-6 text-surface-400" />}
            title="No countries configured"
            description="Add target countries to start building market entry strategies."
          />
        </Card>
      </div>
    );
  }

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
        {countries.map((c) => {
          const id = c.id ?? c.code;
          return (
            <button
              key={id}
              onClick={() => setSelectedCountryId(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedCountryId === id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-surface-600 border border-surface-200 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              <span>{c.flag}</span>
              <span>{c.code}</span>
              {selectedCountryId === id && (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Detail loading / error states */}
      {isLoading && !data && (
        <>
          <CardSkeleton lines={1} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><CardSkeleton lines={4} /></div>
            <ChartSkeleton height="h-56" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton height="h-64" />
            <CardSkeleton lines={4} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TableSkeleton rows={3} cols={3} />
            <CardSkeleton lines={4} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CardSkeleton lines={3} />
            <div className="lg:col-span-2"><CardSkeleton lines={4} /></div>
          </div>
        </>
      )}

      {(detailError || strategyError) && !data && (
        <Card>
          <ApiErrorDisplay
            error={detailError || strategyError}
            onRetry={() => {
              refetchDetail();
              refetchStrategy();
            }}
            message="Failed to load country strategy details"
          />
        </Card>
      )}

      {!isLoading && !data && !detailError && !strategyError && (
        <Card>
          <EmptyState
            icon={<Target className="w-6 h-6 text-surface-400" />}
            title="No strategy data"
            description="Strategy data for this country is not yet available."
          />
        </Card>
      )}

      {/* ---------- Render country detail when data is available ---------- */}
      {data && (
        <>
          {/* Country name banner */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{data.flag}</span>
            <h2 className="text-lg font-semibold text-surface-900">{data.label}</h2>
            <StatusBadge status={data.entryPhases?.find((p) => p.status === 'in_progress') ? 'in_progress' : 'planned'} />
          </div>

          {/* Row 1: Strategy Overview + Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Strategy Overview */}
            <Card title="Strategy Overview" className="lg:col-span-2">
              {data.overview ? (
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
                        sensitivityColors[data.overview.priceSensitivity] || ''
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
              ) : (
                <CardSkeleton lines={4} />
              )}
            </Card>

            {/* Radar Chart - Market Readiness */}
            <Card title="Market Readiness">
              {data.radarData && data.radarData.length > 0 ? (
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
              ) : (
                <ChartSkeleton height="h-56" />
              )}
            </Card>
          </div>

          {/* Row 2: Platform Mix + Cultural Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Platform Mix */}
            <Card title="Platform Mix Recommendation" subtitle="Budget allocation by channel">
              {data.platformMix && data.platformMix.length > 0 ? (
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
              ) : (
                <ChartSkeleton height="h-64" />
              )}
            </Card>

            {/* Cultural Insights */}
            <Card title="Cultural Insights" subtitle="Key market nuances to incorporate">
              {data.culturalInsights && data.culturalInsights.length > 0 ? (
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
              ) : (
                <EmptyState
                  title="No cultural insights"
                  description="Cultural insights for this market are not yet available."
                />
              )}
            </Card>
          </div>

          {/* Row 3: Competitive Landscape + Entry Strategy Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Competitive Landscape */}
            <Card title="Competitive Landscape" subtitle="Top competitors by market share">
              {data.competitors && data.competitors.length > 0 ? (
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
              ) : (
                <EmptyState
                  title="No competitor data"
                  description="Competitive landscape data is not yet available for this market."
                />
              )}
            </Card>

            {/* Entry Strategy Timeline */}
            <Card title="Entry Strategy Timeline" subtitle="Phased market entry approach">
              {data.entryPhases && data.entryPhases.length > 0 ? (
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
              ) : (
                <EmptyState
                  title="No entry phases"
                  description="Market entry timeline is not yet defined for this country."
                />
              )}
            </Card>
          </div>

          {/* Row 4: Confidence Score + Strategic Blueprint */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Confidence Score */}
            <Card title="Strategy Confidence">
              <div className="flex flex-col items-center justify-center py-4 space-y-4">
                <ConfidenceScore score={data.confidence ?? 0} size="lg" />
                <p className="text-sm text-surface-500 text-center max-w-[220px]">
                  Overall confidence in the {data.label} market entry strategy
                </p>
                <div className="w-full pt-3 border-t border-surface-100 space-y-2">
                  {(data.radarData ?? []).slice(0, 4).map((item) => (
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
              {data.blueprintActions && data.blueprintActions.length > 0 ? (
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
              ) : (
                <EmptyState
                  title="No blueprint actions"
                  description="Strategic blueprint actions are not yet defined for this market."
                />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
