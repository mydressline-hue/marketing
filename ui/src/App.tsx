import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useTheme } from './hooks/useTheme';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const MarketIntelligence = lazy(() => import('./pages/MarketIntelligence'));
const CountryStrategy = lazy(() => import('./pages/CountryStrategy'));
const PaidAds = lazy(() => import('./pages/PaidAds'));
const OrganicSocial = lazy(() => import('./pages/OrganicSocial'));
const ContentBlog = lazy(() => import('./pages/ContentBlog'));
const CreativeStudio = lazy(() => import('./pages/CreativeStudio'));
const Analytics = lazy(() => import('./pages/Analytics'));
const BudgetOptimizer = lazy(() => import('./pages/BudgetOptimizer'));
const ABTesting = lazy(() => import('./pages/ABTesting'));
const Conversion = lazy(() => import('./pages/Conversion'));
const Shopify = lazy(() => import('./pages/Shopify'));
const Localization = lazy(() => import('./pages/Localization'));
const Compliance = lazy(() => import('./pages/Compliance'));
const CompetitiveIntel = lazy(() => import('./pages/CompetitiveIntel'));
const FraudDetection = lazy(() => import('./pages/FraudDetection'));
const BrandConsistency = lazy(() => import('./pages/BrandConsistency'));
const DataEngineering = lazy(() => import('./pages/DataEngineering'));
const Security = lazy(() => import('./pages/Security'));
const RevenueForecast = lazy(() => import('./pages/RevenueForecast'));
const Orchestrator = lazy(() => import('./pages/Orchestrator'));
const KillSwitch = lazy(() => import('./pages/KillSwitch'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const VideoGeneration = lazy(() => import('./pages/VideoGeneration'));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-3 border-primary-200 dark:border-surface-700 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  useTheme();

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 transition-colors duration-200">
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Sidebar />
      <div className="lg:ml-[260px]">
        <Header />
        <main id="main-content" role="main" className="p-6">
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/market-intelligence" element={<MarketIntelligence />} />
                <Route path="/country-strategy" element={<CountryStrategy />} />
                <Route path="/paid-ads" element={<PaidAds />} />
                <Route path="/organic-social" element={<OrganicSocial />} />
                <Route path="/content-blog" element={<ContentBlog />} />
                <Route path="/creative-studio" element={<CreativeStudio />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/budget-optimizer" element={<BudgetOptimizer />} />
                <Route path="/ab-testing" element={<ABTesting />} />
                <Route path="/conversion" element={<Conversion />} />
                <Route path="/shopify" element={<Shopify />} />
                <Route path="/localization" element={<Localization />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/competitive-intel" element={<CompetitiveIntel />} />
                <Route path="/fraud-detection" element={<FraudDetection />} />
                <Route path="/brand-consistency" element={<BrandConsistency />} />
                <Route path="/data-engineering" element={<DataEngineering />} />
                <Route path="/security" element={<Security />} />
                <Route path="/revenue-forecast" element={<RevenueForecast />} />
                <Route path="/orchestrator" element={<Orchestrator />} />
                <Route path="/kill-switch" element={<KillSwitch />} />
                <Route path="/video-generation" element={<VideoGeneration />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
