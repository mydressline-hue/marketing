import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';

export interface ProductFilters {
  search?: string; isActive?: boolean; collectionId?: string;
  minPrice?: number; maxPrice?: number; minInventory?: number; maxInventory?: number;
  tags?: string[]; vendor?: string; productType?: string;
  createdAfter?: string; createdBefore?: string; hasImages?: boolean;
  syncStatus?: 'synced' | 'unsynced' | 'all';
  sortBy?: string; sortOrder?: 'asc' | 'desc'; page?: number; limit?: number;
}

interface Collection { id: string; title: string; product_count: number; }
interface Aggregations {
  vendors: { name: string; count: number }[];
  statuses: { status: string; count: number }[];
  priceRanges: { range: string; count: number }[];
  inventoryRanges: { range: string; count: number }[];
  syncStatuses: { status: string; count: number }[];
  totalProducts: number;
}

interface Props {
  onFilterChange: (filters: ProductFilters) => void;
  initialFilters?: ProductFilters;
  resultCount?: number;
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-surface-100 dark:border-surface-700 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-2.5 text-sm font-medium text-surface-700 dark:text-surface-200">
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function Chip({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-500/30'
        : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border border-transparent hover:bg-surface-200 dark:hover:bg-surface-600'
      }`}>
      {label}{count !== undefined && <span className="text-[10px] opacity-70">({count})</span>}
    </button>
  );
}

export default function ProductFilterPanel({ onFilterChange, initialFilters = {}, resultCount }: Props) {
  const [filters, setFilters] = useState<ProductFilters>(initialFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: aggsData } = useApiQuery<{ data: Aggregations }>('/v1/products/filters/aggregations');
  const { data: colsData } = useApiQuery<{ data: Collection[] }>('/v1/products/collections');
  const aggs = aggsData?.data;
  const collections = colsData?.data ?? [];

  const updateFilter = useCallback((patch: Partial<ProductFilters>) => {
    setFilters(prev => {
      const next = { ...prev, ...patch, page: 1 };
      onFilterChange(next);
      return next;
    });
  }, [onFilterChange]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateFilter({ search: searchInput || undefined }), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput, updateFilter]);

  const activeCount = Object.values(filters).filter(v => v !== undefined && v !== '' && v !== 'all').length;

  const clearAll = () => {
    setFilters({}); setSearchInput(''); onFilterChange({});
  };

  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search products..."
          className="w-full pl-9 pr-8 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
        {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"><X className="w-3.5 h-3.5" /></button>}
      </div>

      {resultCount !== undefined && <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">{resultCount} products found</p>}

      {/* Active filters bar */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-surface-500 dark:text-surface-400"><SlidersHorizontal className="w-3 h-3 inline mr-1" />{activeCount} filters</span>
          <button onClick={clearAll} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 font-medium">Clear all</button>
        </div>
      )}

      {/* Status */}
      <Accordion title="Status" defaultOpen>
        <div className="flex flex-wrap gap-2">
          <Chip label="Active" active={filters.isActive === true} count={aggs?.statuses.find(s => s.status === 'active')?.count}
            onClick={() => updateFilter({ isActive: filters.isActive === true ? undefined : true })} />
          <Chip label="Inactive" active={filters.isActive === false} count={aggs?.statuses.find(s => s.status === 'inactive')?.count}
            onClick={() => updateFilter({ isActive: filters.isActive === false ? undefined : false })} />
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {['synced', 'unsynced', 'all'].map(s => (
            <Chip key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} active={(filters.syncStatus ?? 'all') === s}
              count={aggs?.syncStatuses.find(ss => ss.status === s)?.count}
              onClick={() => updateFilter({ syncStatus: s === 'all' ? undefined : s as 'synced' | 'unsynced' })} />
          ))}
        </div>
      </Accordion>

      {/* Price Range */}
      <Accordion title="Price Range">
        <div className="flex items-center gap-2">
          <input type="number" placeholder="Min" value={filters.minPrice ?? ''} onChange={e => updateFilter({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100" />
          <span className="text-surface-400">-</span>
          <input type="number" placeholder="Max" value={filters.maxPrice ?? ''} onChange={e => updateFilter({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100" />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {aggs?.priceRanges.map(pr => (
            <Chip key={pr.range} label={pr.range} count={pr.count} active={false} onClick={() => {}} />
          ))}
        </div>
      </Accordion>

      {/* Inventory */}
      <Accordion title="Inventory Level">
        <div className="flex flex-wrap gap-2">
          {aggs?.inventoryRanges.map(ir => (
            <Chip key={ir.range} label={ir.range} count={ir.count} active={false} onClick={() => {}} />
          ))}
        </div>
      </Accordion>

      {/* Collections */}
      <Accordion title="Collections">
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {collections.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="collection" checked={filters.collectionId === c.id}
                onChange={() => updateFilter({ collectionId: filters.collectionId === c.id ? undefined : c.id })}
                className="accent-primary-600" />
              <span className="text-surface-700 dark:text-surface-200 truncate">{c.title}</span>
              <span className="text-[10px] text-surface-400 ml-auto">({c.product_count})</span>
            </label>
          ))}
        </div>
      </Accordion>

      {/* Vendors */}
      <Accordion title="Vendor">
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {(aggs?.vendors ?? []).map(v => (
            <label key={v.name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="vendor" checked={filters.vendor === v.name}
                onChange={() => updateFilter({ vendor: filters.vendor === v.name ? undefined : v.name })}
                className="accent-primary-600" />
              <span className="text-surface-700 dark:text-surface-200 truncate">{v.name}</span>
              <span className="text-[10px] text-surface-400 ml-auto">({v.count})</span>
            </label>
          ))}
        </div>
      </Accordion>

      {/* Sort */}
      <Accordion title="Sort By">
        <select value={filters.sortBy ?? 'created_at'} onChange={e => updateFilter({ sortBy: e.target.value })}
          className="w-full text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 mb-2">
          <option value="created_at">Date Created</option>
          <option value="title">Title</option>
          <option value="inventory_level">Inventory</option>
          <option value="updated_at">Last Updated</option>
        </select>
        <div className="flex gap-2">
          <Chip label="Ascending" active={filters.sortOrder === 'asc'} onClick={() => updateFilter({ sortOrder: 'asc' })} />
          <Chip label="Descending" active={filters.sortOrder !== 'asc'} onClick={() => updateFilter({ sortOrder: 'desc' })} />
        </div>
      </Accordion>
    </div>
  );
}
