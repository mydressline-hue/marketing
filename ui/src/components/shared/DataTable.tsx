import React, { useMemo, useCallback } from 'react';
import { useVirtualList } from '../../hooks/useVirtualList';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  /** Enable virtual scrolling for large lists. Provide containerHeight in px. */
  virtualScroll?: {
    containerHeight: number;
    rowHeight?: number;
    overscan?: number;
  };
}

// ---------------------------------------------------------------------------
// Memoized row component to prevent unnecessary re-renders when siblings change
// ---------------------------------------------------------------------------

interface DataTableRowProps<T> {
  item: T;
  columns: Column<T>[];
  onClick?: (item: T) => void;
  isClickable: boolean;
  style?: React.CSSProperties;
}

const DataTableRowInner = <T extends Record<string, unknown>>({
  item,
  columns,
  onClick,
  isClickable,
  style,
}: DataTableRowProps<T>) => {
  return (
    <tr
      className={`border-b border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors ${isClickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500' : ''}`}
      onClick={onClick ? () => onClick(item) : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(item); } } : undefined}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
      style={style}
    >
      {columns.map(col => (
        <td key={col.key} className={`py-3 px-4 ${col.className || ''}`}>
          {col.render ? col.render(item) : String(item[col.key] ?? '')}
        </td>
      ))}
    </tr>
  );
};

// We type-assert the memo wrapper so generic inference still works at call sites.
const DataTableRow = React.memo(DataTableRowInner) as typeof DataTableRowInner;

// ---------------------------------------------------------------------------
// Virtualized table body
// ---------------------------------------------------------------------------

const VIRTUAL_THRESHOLD = 50;
const DEFAULT_ROW_HEIGHT = 48;

function VirtualizedBody<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  containerHeight,
  rowHeight,
  overscan,
}: {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  containerHeight: number;
  rowHeight: number;
  overscan: number;
}) {
  const { virtualItems, totalHeight, containerRef } = useVirtualList(data, {
    itemHeight: rowHeight,
    containerHeight,
    overscan,
  });

  const isClickable = !!onRowClick;

  return (
    <div
      ref={containerRef}
      style={{ height: containerHeight, overflow: 'auto' }}
    >
      <table className="w-full text-sm">
        <tbody>
          {/* Spacer row to position visible rows correctly */}
          <tr style={{ height: totalHeight, position: 'relative' }} aria-hidden>
            <td style={{ padding: 0, border: 'none' }} />
          </tr>
        </tbody>
      </table>
      {/* Position the visible rows absolutely on top of the spacer */}
      <div style={{ position: 'relative', marginTop: -totalHeight }}>
        <table className="w-full text-sm">
          <tbody>
            {virtualItems.map(({ index, offsetTop, item }) => (
              <DataTableRow
                key={index}
                item={item}
                columns={columns}
                onClick={onRowClick}
                isClickable={isClickable}
                style={{
                  position: 'absolute',
                  top: offsetTop,
                  width: '100%',
                  height: rowHeight,
                  display: 'table-row',
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DataTable component
// ---------------------------------------------------------------------------

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  virtualScroll,
}: DataTableProps<T>) {
  const isClickable = !!onRowClick;

  // Memoize column config reference so child rows don't re-render when parent
  // re-renders with the same column definitions.
  const stableColumns = useMemo(() => columns, [columns]);

  // Stabilise the onRowClick callback reference
  const stableOnRowClick = useCallback(
    (item: T) => onRowClick?.(item),
    [onRowClick],
  );

  // Decide whether to use virtual scrolling:
  // explicit opt-in via props, or automatic for large lists
  const useVirtual =
    virtualScroll ||
    (data.length > VIRTUAL_THRESHOLD
      ? { containerHeight: 600, rowHeight: DEFAULT_ROW_HEIGHT, overscan: 5 }
      : null);

  if (useVirtual && data.length > 0) {
    const rowHeight = useVirtual.rowHeight ?? DEFAULT_ROW_HEIGHT;
    const overscan = useVirtual.overscan ?? 5;

    return (
      <div className="overflow-x-auto">
        {/* Sticky header */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 dark:border-surface-700">
              {stableColumns.map(col => (
                <th
                  key={col.key}
                  className={`text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300 ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
        </table>

        <VirtualizedBody
          data={data}
          columns={stableColumns}
          onRowClick={stableOnRowClick}
          containerHeight={useVirtual.containerHeight}
          rowHeight={rowHeight}
          overscan={overscan}
        />
      </div>
    );
  }

  // Standard (non-virtual) rendering for small lists
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 dark:border-surface-700">
            {stableColumns.map(col => (
              <th
                key={col.key}
                className={`text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300 ${col.className || ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => (
            <DataTableRow
              key={i}
              item={item}
              columns={stableColumns}
              onClick={stableOnRowClick}
              isClickable={isClickable}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
