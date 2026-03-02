import { useState, useCallback, useMemo } from 'react';
import { Sparkles, Eye, TrendingUp, Zap, Shuffle, ShoppingCart, ChevronDown, ChevronUp, Grid3X3, List, Download } from 'lucide-react';
import Card from '../shared/Card';
import EmptyState from '../shared/EmptyState';
import ConfidenceScore from '../shared/ConfidenceScore';
import { CardSkeleton } from '../shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../shared/ErrorBoundary';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';

interface Collection { id: string; title: string; product_count: number; }
interface PickedProduct {
  id: string; title: string; description: string | null; inventory_level: number;
  score: number; reasoning: string; images: unknown[]; variants: unknown[];
  scoreBreakdown: { views: number; sales: number; conversion: number; recency: number; inventory: number };
}
interface PickResult {
  products: PickedProduct[]; strategy: string; totalCandidates: number;
  confidence: number; insights: string[];
}
interface Strategy { id: string; name: string; description: string; icon: string; requiresAI: boolean; }

const STRATEGY_ICONS: Record<string, typeof Sparkles> = {
  Shuffle, Eye, TrendingUp, Zap, Sparkles, ShoppingCart,
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
    : score >= 60 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
    : score >= 40 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
    : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{score}</span>;
}

export default function AIProductPicker() {
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ai_recommended');
  const [count, setCount] = useState(10);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showInsights, setShowInsights] = useState(false);

  const { data: collectionsData, loading: colLoading, error: colError } = useApiQuery<{ data: Collection[] }>('/v1/products/collections');
  const { data: strategiesData } = useApiQuery<{ data: Strategy[] }>('/v1/products/ai-pick/strategies');
  const { mutate: pickProducts, loading: picking, data: pickResult } = useApiMutation<{ data: PickResult }>('/v1/products/ai-pick', { method: 'POST' });

  const collections = collectionsData?.data ?? [];
  const strategies = strategiesData?.data ?? [];
  const result = pickResult?.data ?? null;

  const handlePick = useCallback(async () => {
    await pickProducts({ collectionId: selectedCollection || undefined, strategy: selectedStrategy, count });
  }, [pickProducts, selectedCollection, selectedStrategy, count]);

  const sortedProducts = useMemo(() => {
    if (!result?.products) return [];
    return [...result.products].sort((a, b) => b.score - a.score);
  }, [result]);

  const handleExport = useCallback(() => {
    if (!sortedProducts.length) return;
    const csv = ['ID,Title,Score,Inventory,Reasoning',
      ...sortedProducts.map(p => `"${p.id}","${p.title}",${p.score},${p.inventory_level},"${p.reasoning}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ai-picks.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [sortedProducts]);

  return (
    <div className="space-y-6">
      {/* Collection Selector */}
      <Card title="Select Collection" subtitle="Choose a collection or search all products">
        {colLoading ? <CardSkeleton lines={2} /> : colError ? <ApiErrorDisplay error={colError} /> : (
          <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}
            className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
            <option value="">All Products</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.title} ({c.product_count} products)</option>)}
          </select>
        )}
      </Card>

      {/* Strategy Picker */}
      <Card title="Picking Strategy" subtitle="Choose how products should be selected">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {strategies.map(s => {
            const Icon = STRATEGY_ICONS[s.icon] ?? Sparkles;
            const isSelected = selectedStrategy === s.id;
            return (
              <button key={s.id} onClick={() => setSelectedStrategy(s.id)}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                }`}>
                {isSelected && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-primary-500 rounded-full" />}
                <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'}`} />
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{s.name}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{s.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Config & Pick */}
      <Card title="Configuration" actions={
        <button onClick={handlePick} disabled={picking}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium">
          <Sparkles className={`w-4 h-4 ${picking ? 'animate-spin' : ''}`} />
          {picking ? 'Picking...' : 'Pick Products'}
        </button>
      }>
        <div className="flex items-center gap-4">
          <label className="text-sm text-surface-600 dark:text-surface-300">Products to pick:</label>
          <input type="range" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="flex-1 accent-primary-600" />
          <span className="text-sm font-bold text-surface-900 dark:text-surface-100 min-w-[2rem] text-center">{count}</span>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <>
          <Card title={`Results (${sortedProducts.length} products)`}
            subtitle={`Strategy: ${result.strategy} | Candidates: ${result.totalCandidates}`}
            actions={
              <div className="flex items-center gap-2">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600' : 'text-surface-400'}`}><Grid3X3 className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600' : 'text-surface-400'}`}><List className="w-4 h-4" /></button>
                <button onClick={handleExport} className="flex items-center gap-1 text-xs text-surface-600 dark:text-surface-300 hover:text-surface-800 font-medium">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            }>
            {sortedProducts.length === 0 ? (
              <EmptyState title="No products found" description="Try adjusting your filters or collection." />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedProducts.map(p => (
                  <div key={p.id} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 line-clamp-2">{p.title}</h4>
                      <ScoreBadge score={p.score} />
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">Stock: <span className={p.inventory_level < 10 ? 'text-red-600 font-semibold' : ''}>{p.inventory_level}</span></p>
                    <p className="text-xs text-surface-600 dark:text-surface-300 line-clamp-2">{p.reasoning}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-surface-100 dark:divide-surface-700">
                {sortedProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-4 py-3">
                    <span className="text-xs text-surface-400 w-6 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{p.title}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{p.reasoning}</p>
                    </div>
                    <span className="text-xs text-surface-500 dark:text-surface-400">Stock: {p.inventory_level}</span>
                    <ScoreBadge score={p.score} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Insights */}
          <Card title="Performance Insights" actions={
            <button onClick={() => setShowInsights(!showInsights)} className="text-surface-400 hover:text-surface-600">
              {showInsights ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          }>
            <div className="flex items-center gap-4 mb-3">
              <ConfidenceScore score={result.confidence} size="sm" />
              <div>
                <p className="text-sm font-medium text-surface-900 dark:text-surface-100">Confidence: {result.confidence}%</p>
                <p className="text-xs text-surface-500 dark:text-surface-400">Based on data quality and strategy</p>
              </div>
            </div>
            {showInsights && (
              <ul className="space-y-1.5">
                {result.insights.map((insight, i) => (
                  <li key={i} className="text-sm text-surface-600 dark:text-surface-300 flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">•</span> {insight}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
