import { useState, useCallback, useEffect } from 'react';
import { Package, Sparkles, FolderOpen, BarChart3, Grid3X3, List, Plus, Trash2 } from 'lucide-react';
import Card from '../shared/Card';
import EmptyState from '../shared/EmptyState';
import StatusBadge from '../shared/StatusBadge';
import DataTable from '../shared/DataTable';
import { CardSkeleton, TableSkeleton } from '../shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../shared/ErrorBoundary';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import AIProductPicker from './AIProductPicker';
import ProductFilterPanel, { type ProductFilters } from './ProductFilterPanel';
import ProductAnalyticsDashboard from './ProductAnalyticsDashboard';

interface Product { [key: string]: unknown; id: string; title: string; description: string | null; inventory_level: number; is_active: boolean; synced_at: string | null; }
interface Collection { [key: string]: unknown; id: string; title: string; description: string | null; collection_type: string; product_count: number; }

type Tab = 'products' | 'ai-picker' | 'collections' | 'analytics';
const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'ai-picker', label: 'AI Picker', icon: Sparkles },
  { id: 'collections', label: 'Collections', icon: FolderOpen },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function ProductsHub() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const hash = window.location.hash.slice(1) as Tab;
    return TABS.some(t => t.id === hash) ? hash : 'products';
  });

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1) as Tab;
      if (TABS.some(t => t.id === h)) setActiveTab(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  const selectTab = (tab: Tab) => { setActiveTab(tab); };

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="bg-surface-50 dark:bg-surface-900 rounded-xl p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => selectTab(tab.id)} role="tab" aria-selected={isActive}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive ? 'bg-white dark:bg-surface-800 text-primary-600 dark:text-primary-400 shadow-sm border border-surface-200 dark:border-surface-700'
                : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
              }`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'products' && <ProductsTab />}
      {activeTab === 'ai-picker' && <AIProductPicker />}
      {activeTab === 'collections' && <CollectionsTab />}
      {activeTab === 'analytics' && <ProductAnalyticsDashboard />}
    </div>
  );
}

function ProductsTab() {
  const [filters, setFilters] = useState<ProductFilters>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);

  const queryParams: Record<string, string> = { page: String(page), limit: '20' };
  if (filters.search) queryParams.search = filters.search;
  if (filters.isActive !== undefined) queryParams.status = filters.isActive ? 'active' : 'inactive';
  if (filters.sortBy) queryParams.sortBy = filters.sortBy;
  if (filters.sortOrder) queryParams.sortOrder = filters.sortOrder;
  if (filters.collectionId) queryParams.collectionId = filters.collectionId;
  if (filters.vendor) queryParams.vendor = filters.vendor;
  if (filters.minPrice !== undefined) queryParams.minPrice = String(filters.minPrice);
  if (filters.maxPrice !== undefined) queryParams.maxPrice = String(filters.maxPrice);
  if (filters.minInventory !== undefined) queryParams.inventoryMin = String(filters.minInventory);
  if (filters.maxInventory !== undefined) queryParams.inventoryMax = String(filters.maxInventory);

  const { data, loading, error, refetch } = useApiQuery<{ data: Product[]; meta: { total: number; page: number; totalPages: number } }>('/v1/products/filter', { params: queryParams });

  const products = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, totalPages: 1 };

  const handleFilterChange = useCallback((f: ProductFilters) => { setFilters(f); setPage(1); }, []);

  const columns = [
    { key: 'title', label: 'Product', render: (p: Product) => <span className="font-medium text-surface-900 dark:text-surface-100">{p.title}</span> },
    { key: 'inventory_level', label: 'Stock', render: (p: Product) => <span className={p.inventory_level < 10 ? 'text-red-600 font-semibold' : p.inventory_level < 50 ? 'text-yellow-600' : 'text-surface-700 dark:text-surface-200'}>{p.inventory_level}</span> },
    { key: 'is_active', label: 'Status', render: (p: Product) => <StatusBadge status={p.is_active ? 'active' : 'inactive'} /> },
    { key: 'synced_at', label: 'Synced', render: (p: Product) => <span className="text-xs text-surface-500 dark:text-surface-400">{p.synced_at ? 'Yes' : 'No'}</span> },
  ];

  return (
    <div className="flex gap-4">
      {showFilters && (
        <div className="w-72 shrink-0 hidden lg:block">
          <ProductFilterPanel onFilterChange={handleFilterChange} resultCount={meta.total} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden text-xs text-primary-600 font-medium">Filters</button>
            <span className="text-sm text-surface-500 dark:text-surface-400">{meta.total} products</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600' : 'text-surface-400'}`}><Grid3X3 className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600' : 'text-surface-400'}`}><List className="w-4 h-4" /></button>
          </div>
        </div>

        <Card noPadding>
          {loading ? <TableSkeleton rows={8} columns={4} /> : error ? <ApiErrorDisplay error={error} onRetry={refetch} /> : products.length === 0 ? (
            <EmptyState icon={<Package className="w-6 h-6 text-surface-400" />} title="No products" description="Adjust your filters or sync products from Shopify." />
          ) : viewMode === 'list' ? (
            <DataTable columns={columns} data={products} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {products.map(p => (
                <div key={p.id} className="rounded-xl border border-surface-200 dark:border-surface-700 p-4">
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">{p.title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs ${p.inventory_level < 10 ? 'text-red-600' : 'text-surface-500 dark:text-surface-400'}`}>Stock: {p.inventory_level}</span>
                    <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm border border-surface-200 dark:border-surface-700 rounded-lg disabled:opacity-50 text-surface-700 dark:text-surface-200">Prev</button>
            <span className="text-sm text-surface-500 dark:text-surface-400">Page {page} of {meta.totalPages}</span>
            <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages} className="px-3 py-1.5 text-sm border border-surface-200 dark:border-surface-700 rounded-lg disabled:opacity-50 text-surface-700 dark:text-surface-200">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'manual' | 'automated'>('manual');

  const { data, loading, error, refetch } = useApiQuery<{ data: Collection[] }>('/v1/products/collections');
  const { mutate: createCol, loading: creating } = useApiMutation<unknown>('/v1/products/collections', { method: 'POST', invalidates: ['/v1/products/collections'] });
  const { mutate: deleteCol } = useApiMutation<unknown>('/v1/products/collections', { method: 'DELETE' });

  const collections = data?.data ?? [];

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createCol({ title: newTitle, collection_type: newType });
    setNewTitle(''); setShowCreate(false); refetch();
  };

  const handleDelete = async () => {
    await deleteCol(); // Note: Would need proper endpoint
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">Collections</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Collection
        </button>
      </div>

      {showCreate && (
        <Card title="Create Collection">
          <div className="space-y-3">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Collection name"
              className="w-full text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
            <select value={newType} onChange={e => setNewType(e.target.value as 'manual' | 'automated')}
              className="w-full text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100">
              <option value="manual">Manual</option><option value="automated">Automated</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-surface-600 dark:text-surface-300">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5"><CardSkeleton lines={3} /></div>)}</div>
      ) : error ? <ApiErrorDisplay error={error} onRetry={refetch} /> : collections.length === 0 ? (
        <EmptyState icon={<FolderOpen className="w-6 h-6 text-surface-400" />} title="No collections" description="Create your first collection to organize products." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map(c => (
            <div key={c.id} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-primary-500" />
                  <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{c.title}</h4>
                </div>
                <button onClick={() => handleDelete(c.id)} className="text-surface-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={c.collection_type === 'automated' ? 'active' : 'draft'} />
                <span className="text-xs text-surface-500 dark:text-surface-400">{c.product_count} products</span>
              </div>
              {c.description && <p className="text-xs text-surface-500 dark:text-surface-400 mt-2 line-clamp-2">{c.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
