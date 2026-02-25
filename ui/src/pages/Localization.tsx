import { useState } from 'react';
import {
  Languages,
  Globe,
  CheckCircle,
  Clock,
  AlertCircle,
  Edit,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const languages = [
  {
    code: 'en',
    language: 'English',
    country: 'United States',
    flag: '\u{1F1FA}\u{1F1F8}',
    completeness: 100,
    status: 'complete' as const,
    itemsTranslated: 4820,
    totalItems: 4820,
    lastUpdated: '2026-02-25',
    qualityScore: 99,
  },
  {
    code: 'de',
    language: 'German',
    country: 'Germany',
    flag: '\u{1F1E9}\u{1F1EA}',
    completeness: 97,
    status: 'complete' as const,
    itemsTranslated: 4675,
    totalItems: 4820,
    lastUpdated: '2026-02-24',
    qualityScore: 96,
  },
  {
    code: 'ja',
    language: 'Japanese',
    country: 'Japan',
    flag: '\u{1F1EF}\u{1F1F5}',
    completeness: 94,
    status: 'in_progress' as const,
    itemsTranslated: 4531,
    totalItems: 4820,
    lastUpdated: '2026-02-24',
    qualityScore: 93,
  },
  {
    code: 'ar',
    language: 'Arabic',
    country: 'Saudi Arabia',
    flag: '\u{1F1F8}\u{1F1E6}',
    completeness: 91,
    status: 'in_progress' as const,
    itemsTranslated: 4387,
    totalItems: 4820,
    lastUpdated: '2026-02-23',
    qualityScore: 90,
  },
  {
    code: 'pt',
    language: 'Portuguese',
    country: 'Brazil',
    flag: '\u{1F1E7}\u{1F1F7}',
    completeness: 96,
    status: 'complete' as const,
    itemsTranslated: 4627,
    totalItems: 4820,
    lastUpdated: '2026-02-24',
    qualityScore: 95,
  },
  {
    code: 'fr',
    language: 'French',
    country: 'France',
    flag: '\u{1F1EB}\u{1F1F7}',
    completeness: 93,
    status: 'in_progress' as const,
    itemsTranslated: 4483,
    totalItems: 4820,
    lastUpdated: '2026-02-23',
    qualityScore: 92,
  },
  {
    code: 'ko',
    language: 'Korean',
    country: 'South Korea',
    flag: '\u{1F1F0}\u{1F1F7}',
    completeness: 88,
    status: 'in_progress' as const,
    itemsTranslated: 4242,
    totalItems: 4820,
    lastUpdated: '2026-02-22',
    qualityScore: 89,
  },
  {
    code: 'hi',
    language: 'Hindi',
    country: 'India',
    flag: '\u{1F1EE}\u{1F1F3}',
    completeness: 82,
    status: 'in_progress' as const,
    itemsTranslated: 3952,
    totalItems: 4820,
    lastUpdated: '2026-02-21',
    qualityScore: 85,
  },
];

const contentTypeData = [
  { type: 'Product Desc.', completeness: 97 },
  { type: 'Ad Copy', completeness: 94 },
  { type: 'Blog Posts', completeness: 89 },
  { type: 'UI Strings', completeness: 98 },
  { type: 'Legal/Compliance', completeness: 91 },
];

const culturalAdaptations = [
  {
    code: 'en',
    flag: '\u{1F1FA}\u{1F1F8}',
    language: 'English',
    dateFormat: 'MM/DD/YYYY',
    currencyDisplay: '$1,234.56',
    numberFormat: '1,234.56',
    direction: 'LTR',
    colorNotes: 'Standard Western palette. Green = positive, red = caution.',
  },
  {
    code: 'de',
    flag: '\u{1F1E9}\u{1F1EA}',
    language: 'German',
    dateFormat: 'DD.MM.YYYY',
    currencyDisplay: '1.234,56 \u20AC',
    numberFormat: '1.234,56',
    direction: 'LTR',
    colorNotes: 'Conservative tones preferred. Avoid overly bright CTAs.',
  },
  {
    code: 'ja',
    flag: '\u{1F1EF}\u{1F1F5}',
    language: 'Japanese',
    dateFormat: 'YYYY/MM/DD',
    currencyDisplay: '\u00A51,234',
    numberFormat: '1,234.56',
    direction: 'LTR',
    colorNotes: 'Red is celebratory/lucky. White can imply purity or mourning.',
  },
  {
    code: 'ar',
    flag: '\u{1F1F8}\u{1F1E6}',
    language: 'Arabic',
    dateFormat: 'DD/MM/YYYY',
    currencyDisplay: '\u0631.\u0633 1,234.56',
    numberFormat: '\u0661\u066C\u0662\u0663\u0664\u066B\u0665\u0666',
    direction: 'RTL',
    colorNotes: 'Green holds religious significance. Avoid using green casually.',
  },
  {
    code: 'pt',
    flag: '\u{1F1E7}\u{1F1F7}',
    language: 'Portuguese',
    dateFormat: 'DD/MM/YYYY',
    currencyDisplay: 'R$ 1.234,56',
    numberFormat: '1.234,56',
    direction: 'LTR',
    colorNotes: 'Vibrant colors resonate well. Green/yellow align with national identity.',
  },
  {
    code: 'fr',
    flag: '\u{1F1EB}\u{1F1F7}',
    language: 'French',
    dateFormat: 'DD/MM/YYYY',
    currencyDisplay: '1 234,56 \u20AC',
    numberFormat: '1 234,56',
    direction: 'LTR',
    colorNotes: 'Sophisticated, muted tones. Blue conveys trust and authority.',
  },
  {
    code: 'ko',
    flag: '\u{1F1F0}\u{1F1F7}',
    language: 'Korean',
    dateFormat: 'YYYY.MM.DD',
    currencyDisplay: '\u20A91,234',
    numberFormat: '1,234.56',
    direction: 'LTR',
    colorNotes: 'Pastel tones popular in e-commerce. Red symbolizes passion/energy.',
  },
  {
    code: 'hi',
    flag: '\u{1F1EE}\u{1F1F3}',
    language: 'Hindi',
    dateFormat: 'DD-MM-YYYY',
    currencyDisplay: '\u20B91,234.56',
    numberFormat: '1,23,456.78',
    direction: 'LTR',
    colorNotes: 'Saffron, white, green align with national identity. Red is auspicious.',
  },
];

const reviewItems = [
  {
    id: 'rev-1',
    sourceText: 'Unlock 30% off your first order!',
    translatedText: '\u521D\u56DE\u6CE8\u6587\u306730%\u30AA\u30D5\u3092\u30B2\u30C3\u30C8\uFF01',
    language: 'Japanese',
    flag: '\u{1F1EF}\u{1F1F5}',
    type: 'Ad Copy',
    issue: 'Cultural tone may feel too aggressive for JP market',
    severity: 'warning' as const,
  },
  {
    id: 'rev-2',
    sourceText: 'Free shipping on orders over $50',
    translatedText: '\u0634\u062D\u0646 \u0645\u062C\u0627\u0646\u064A \u0644\u0644\u0637\u0644\u0628\u0627\u062A \u0641\u0648\u0642 50 \u062F\u0648\u0644\u0627\u0631',
    language: 'Arabic',
    flag: '\u{1F1F8}\u{1F1E6}',
    type: 'UI String',
    issue: 'Currency should be converted to SAR equivalent',
    severity: 'error' as const,
  },
  {
    id: 'rev-3',
    sourceText: 'Summer Sale - Limited Time Only',
    translatedText: 'Soldes d\u2019\u00E9t\u00E9 - Offre limit\u00E9e dans le temps',
    language: 'French',
    flag: '\u{1F1EB}\u{1F1F7}',
    type: 'Ad Copy',
    issue: 'France has legal restrictions on the word "Soldes" outside official sale periods',
    severity: 'critical' as const,
  },
  {
    id: 'rev-4',
    sourceText: 'Check out our bestsellers',
    translatedText: '\uBCA0\uC2A4\uD2B8\uC140\uB7EC\uB97C \uD655\uC778\uD558\uC138\uC694',
    language: 'Korean',
    flag: '\u{1F1F0}\u{1F1F7}',
    type: 'Product Description',
    issue: 'Formality level should use honorific form for KR audience',
    severity: 'warning' as const,
  },
  {
    id: 'rev-5',
    sourceText: 'Your cart is waiting!',
    translatedText: '\u0906\u092A\u0915\u0940 \u0915\u093E\u0930\u094D\u091F \u0907\u0902\u0924\u091C\u093E\u0930 \u0915\u0930 \u0930\u0939\u0940 \u0939\u0948!',
    language: 'Hindi',
    flag: '\u{1F1EE}\u{1F1F3}',
    type: 'UI String',
    issue: 'Phrase feels unnatural in Hindi; needs idiomatic adaptation',
    severity: 'warning' as const,
  },
];

const currencyPairs = [
  { from: 'USD', to: 'EUR', rate: 0.9214, change: -0.32, symbol: '$\u2192\u20AC' },
  { from: 'USD', to: 'JPY', rate: 149.85, change: 0.18, symbol: '$\u2192\u00A5' },
  { from: 'USD', to: 'SAR', rate: 3.7500, change: 0.00, symbol: '$\u2192\uFDFC' },
  { from: 'USD', to: 'BRL', rate: 5.8320, change: -0.54, symbol: '$\u2192R$' },
  { from: 'USD', to: 'KRW', rate: 1342.50, change: 0.27, symbol: '$\u2192\u20A9' },
  { from: 'USD', to: 'INR', rate: 83.42, change: -0.11, symbol: '$\u2192\u20B9' },
];

const legalComplianceData = [
  {
    country: 'Germany',
    flag: '\u{1F1E9}\u{1F1EA}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: true,
    cookieConsent: true,
    status: 'compliant' as const,
    notes: 'All GDPR and Impressum requirements met',
  },
  {
    country: 'Japan',
    flag: '\u{1F1EF}\u{1F1F5}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: true,
    cookieConsent: true,
    status: 'compliant' as const,
    notes: 'APPI compliance verified. Specified commercial transaction disclosures complete',
  },
  {
    country: 'Saudi Arabia',
    flag: '\u{1F1F8}\u{1F1E6}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: false,
    cookieConsent: true,
    status: 'warning' as const,
    notes: 'VAT display pending update for 2026 Q1 rate changes',
  },
  {
    country: 'Brazil',
    flag: '\u{1F1E7}\u{1F1F7}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: true,
    cookieConsent: true,
    status: 'compliant' as const,
    notes: 'LGPD compliance confirmed. Consumer defense code requirements met',
  },
  {
    country: 'France',
    flag: '\u{1F1EB}\u{1F1F7}',
    gdprCompliant: true,
    adDisclosure: false,
    priceTransparency: true,
    cookieConsent: true,
    status: 'warning' as const,
    notes: 'Ad copy needs "Soldes" restrictions review for regulated sale periods',
  },
  {
    country: 'South Korea',
    flag: '\u{1F1F0}\u{1F1F7}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: true,
    cookieConsent: true,
    status: 'compliant' as const,
    notes: 'PIPA compliance verified. E-commerce labeling requirements met',
  },
  {
    country: 'India',
    flag: '\u{1F1EE}\u{1F1F3}',
    gdprCompliant: true,
    adDisclosure: true,
    priceTransparency: true,
    cookieConsent: false,
    status: 'review' as const,
    notes: 'Digital Personal Data Protection Act 2023 compliance under review',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getProgressColor = (pct: number): 'success' | 'primary' | 'warning' | 'danger' => {
  if (pct >= 95) return 'success';
  if (pct >= 85) return 'primary';
  if (pct >= 70) return 'warning';
  return 'danger';
};

const severityStyles: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  error: 'border-l-red-500 bg-red-50',
  warning: 'border-l-yellow-500 bg-yellow-50',
  info: 'border-l-blue-500 bg-blue-50',
};

const severityIcon = (severity: string) => {
  if (severity === 'critical' || severity === 'error')
    return <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />;
  if (severity === 'warning')
    return <Clock className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />;
  return <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Localization() {
  const [selectedLang, setSelectedLang] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Multi-Language Localization"
        subtitle="Native-Level Translation & Cultural Adaptation"
        icon={<Languages className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-sm text-surface-600 bg-white border border-surface-200 rounded-lg px-3 py-1.5 hover:bg-surface-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Sync All
            </button>
            <button className="flex items-center gap-1.5 text-sm text-white bg-primary-600 rounded-lg px-3 py-1.5 hover:bg-primary-700 transition-colors">
              <Globe className="w-3.5 h-3.5" />
              Add Language
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Languages Active"
          value={8}
          change={14.3}
          trend="up"
        />
        <KPICard
          label="Translation Coverage"
          value="94%"
          change={3.2}
          trend="up"
        />
        <KPICard
          label="Cultural Adaptations"
          value={156}
          change={22.5}
          trend="up"
        />
        <KPICard
          label="Currency Pairs"
          value={6}
          change={50}
          trend="up"
        />
      </div>

      {/* Language Progress Table */}
      <Card
        title="Language Progress"
        subtitle="Translation completeness by target language"
        actions={
          <span className="text-xs text-surface-500">
            {languages.filter((l) => l.status === 'complete').length} of {languages.length} complete
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left font-medium text-surface-500 pb-3 pr-4">Language</th>
                <th className="text-left font-medium text-surface-500 pb-3 pr-4">Completeness</th>
                <th className="text-left font-medium text-surface-500 pb-3 pr-4">Status</th>
                <th className="text-right font-medium text-surface-500 pb-3 pr-4">Items Translated</th>
                <th className="text-left font-medium text-surface-500 pb-3 pr-4">Last Updated</th>
                <th className="text-right font-medium text-surface-500 pb-3 pr-4">Quality Score</th>
                <th className="text-right font-medium text-surface-500 pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {languages.map((lang) => (
                <tr
                  key={lang.code}
                  className={`border-b border-surface-50 hover:bg-surface-50/50 transition-colors cursor-pointer ${
                    selectedLang === lang.code ? 'bg-primary-50/40' : ''
                  }`}
                  onClick={() => setSelectedLang(selectedLang === lang.code ? null : lang.code)}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{lang.flag}</span>
                      <div>
                        <p className="font-medium text-surface-900">{lang.language}</p>
                        <p className="text-xs text-surface-500">{lang.country}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 min-w-[160px]">
                    <ProgressBar
                      value={lang.completeness}
                      showValue
                      color={getProgressColor(lang.completeness)}
                      size="sm"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={lang.status} />
                  </td>
                  <td className="py-3 pr-4 text-right text-surface-700">
                    <span className="font-medium">{lang.itemsTranslated.toLocaleString()}</span>
                    <span className="text-surface-400"> / {lang.totalItems.toLocaleString()}</span>
                  </td>
                  <td className="py-3 pr-4 text-surface-600">{lang.lastUpdated}</td>
                  <td className="py-3 pr-4 text-right">
                    <span
                      className={`font-semibold ${
                        lang.qualityScore >= 95
                          ? 'text-success-600'
                          : lang.qualityScore >= 90
                            ? 'text-primary-600'
                            : lang.qualityScore >= 85
                              ? 'text-warning-600'
                              : 'text-danger-600'
                      }`}
                    >
                      {lang.qualityScore}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors"
                        title="Edit translations"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors"
                        title="Preview"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors"
                        title="Re-sync"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Chart + Cultural Adaptations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Translation Completeness by Content Type */}
        <Card
          title="Translation Completeness by Content Type"
          subtitle="Average across all 8 languages"
          actions={<Languages className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={contentTypeData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="type"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  width={110}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Completeness']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Bar dataKey="completeness" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Cultural Adaptation Panel */}
        <Card
          title="Cultural Adaptation Settings"
          subtitle="Locale-specific format rules and cultural notes"
          actions={<Globe className="w-4 h-4 text-surface-400" />}
        >
          <div className="max-h-[320px] overflow-y-auto -mr-2 pr-2 space-y-3">
            {culturalAdaptations.map((ca) => (
              <div
                key={ca.code}
                className={`rounded-lg border p-3 transition-colors ${
                  selectedLang === ca.code
                    ? 'border-primary-300 bg-primary-50/40'
                    : 'border-surface-150 hover:border-surface-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{ca.flag}</span>
                  <span className="font-medium text-surface-900 text-sm">{ca.language}</span>
                  {ca.direction === 'RTL' && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      RTL
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-surface-500">Date:</span>{' '}
                    <span className="text-surface-700 font-medium">{ca.dateFormat}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Currency:</span>{' '}
                    <span className="text-surface-700 font-medium">{ca.currencyDisplay}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Number:</span>{' '}
                    <span className="text-surface-700 font-medium">{ca.numberFormat}</span>
                  </div>
                  <div>
                    <span className="text-surface-500">Direction:</span>{' '}
                    <span className="text-surface-700 font-medium">{ca.direction}</span>
                  </div>
                </div>
                <p className="text-xs text-surface-500 mt-2 italic">{ca.colorNotes}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Translation Quality Review */}
      <Card
        title="Translation Quality Review"
        subtitle="Items flagged for human review"
        actions={
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" />
            {reviewItems.filter((r) => r.severity === 'critical').length} critical
          </span>
        }
      >
        <div className="space-y-3">
          {reviewItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${severityStyles[item.severity]}`}
            >
              {severityIcon(item.severity)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-base">{item.flag}</span>
                  <span className="text-sm font-medium text-surface-900">{item.language}</span>
                  <span className="text-xs bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded">
                    {item.type}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <div className="bg-white/60 rounded px-2 py-1.5 border border-surface-100">
                    <p className="text-[10px] uppercase tracking-wider text-surface-400 font-medium mb-0.5">
                      Source (EN)
                    </p>
                    <p className="text-sm text-surface-800">{item.sourceText}</p>
                  </div>
                  <div className="bg-white/60 rounded px-2 py-1.5 border border-surface-100">
                    <p className="text-[10px] uppercase tracking-wider text-surface-400 font-medium mb-0.5">
                      Translation
                    </p>
                    <p className="text-sm text-surface-800" dir={item.language === 'Arabic' ? 'rtl' : 'ltr'}>
                      {item.translatedText}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-surface-600">{item.issue}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <StatusBadge status={item.severity} size="sm" />
                <button className="p-1.5 rounded-md hover:bg-white/60 text-surface-400 hover:text-surface-700 transition-colors">
                  <Edit className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Currency + Legal Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Currency Conversion */}
        <Card
          title="Currency Conversion Pairs"
          subtitle="Live exchange rates for active markets"
          actions={
            <span className="flex items-center gap-1 text-xs text-surface-500">
              <RefreshCw className="w-3 h-3" />
              Updated 5 min ago
            </span>
          }
        >
          <div className="space-y-2">
            {currencyPairs.map((pair) => (
              <div
                key={`${pair.from}-${pair.to}`}
                className="flex items-center justify-between rounded-lg border border-surface-100 px-4 py-3 hover:bg-surface-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono bg-surface-100 text-surface-700 px-2 py-1 rounded">
                    {pair.symbol}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-surface-900">
                      {pair.from} / {pair.to}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-surface-900 font-mono">{pair.rate.toFixed(pair.rate >= 100 ? 2 : 4)}</p>
                  <p
                    className={`text-xs font-medium ${
                      pair.change > 0
                        ? 'text-success-600'
                        : pair.change < 0
                          ? 'text-danger-600'
                          : 'text-surface-500'
                    }`}
                  >
                    {pair.change > 0 ? '+' : ''}
                    {pair.change.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Legal Compliance by Country */}
        <Card
          title="Legal Compliance Messaging"
          subtitle="Regulatory status by target market"
          actions={
            <span className="flex items-center gap-1 text-xs text-surface-500">
              <CheckCircle className="w-3 h-3 text-success-600" />
              {legalComplianceData.filter((c) => c.status === 'compliant').length} / {legalComplianceData.length} compliant
            </span>
          }
        >
          <div className="space-y-2">
            {legalComplianceData.map((entry) => (
              <div
                key={entry.country}
                className="rounded-lg border border-surface-100 px-4 py-3 hover:bg-surface-50/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{entry.flag}</span>
                    <span className="text-sm font-medium text-surface-900">{entry.country}</span>
                  </div>
                  <StatusBadge status={entry.status} size="sm" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                  {[
                    { label: 'GDPR/Privacy', ok: entry.gdprCompliant },
                    { label: 'Ad Disclosure', ok: entry.adDisclosure },
                    { label: 'Price Transparency', ok: entry.priceTransparency },
                    { label: 'Cookie Consent', ok: entry.cookieConsent },
                  ].map((check) => (
                    <span
                      key={check.label}
                      className={`flex items-center gap-1 text-xs ${
                        check.ok ? 'text-success-600' : 'text-danger-600'
                      }`}
                    >
                      {check.ok ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {check.label}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-surface-500">{entry.notes}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
