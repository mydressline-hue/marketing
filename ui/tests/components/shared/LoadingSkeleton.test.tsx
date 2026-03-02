import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  KPISkeleton,
  KPIRowSkeleton,
  TableSkeleton,
  CardSkeleton,
  ChartSkeleton,
  PageSkeleton,
  GallerySkeleton,
  ListSkeleton,
  SkeletonBlock,
} from '../../../src/components/shared/LoadingSkeleton';

describe('SkeletonBlock', () => {
  it('renders a div with animate-pulse class', () => {
    const { container } = render(<SkeletonBlock />);
    const block = container.firstChild as HTMLElement;
    expect(block.className).toContain('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonBlock className="h-4 w-24" />);
    const block = container.firstChild as HTMLElement;
    expect(block.className).toContain('h-4');
    expect(block.className).toContain('w-24');
  });

  it('sets aria-hidden to true', () => {
    const { container } = render(<SkeletonBlock />);
    const block = container.firstChild as HTMLElement;
    expect(block.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('KPISkeleton', () => {
  it('renders a skeleton card with animate-pulse blocks', () => {
    const { container } = render(<KPISkeleton />);
    const pulseBlocks = container.querySelectorAll('.animate-pulse');
    expect(pulseBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('has dark mode classes on the container', () => {
    const { container } = render(<KPISkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('dark:bg-surface-800');
  });
});

describe('KPIRowSkeleton', () => {
  it('renders 4 KPI skeletons by default', () => {
    const { container } = render(<KPIRowSkeleton />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children).toHaveLength(4);
  });

  it('renders custom count of KPI skeletons', () => {
    const { container } = render(<KPIRowSkeleton count={6} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children).toHaveLength(6);
  });
});

describe('TableSkeleton', () => {
  it('renders default 5 rows', () => {
    const { container } = render(<TableSkeleton />);
    // Header + 5 rows
    const rows = container.querySelectorAll('.flex.items-center.gap-4');
    expect(rows.length).toBe(6); // 1 header + 5 data rows
  });

  it('renders custom number of rows', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const allRows = container.querySelectorAll('.flex.items-center.gap-4');
    expect(allRows.length).toBe(4); // 1 header + 3 data rows
  });

  it('supports cols prop as alias for columns', () => {
    const { container } = render(<TableSkeleton cols={3} rows={1} />);
    // Header row should have 3 skeleton blocks
    const headerRow = container.querySelector('.border-b.border-surface-100, .border-b.border-surface-200');
    expect(headerRow).toBeTruthy();
  });

  it('has dark mode classes', () => {
    const { container } = render(<TableSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('dark:bg-surface-800');
  });
});

describe('CardSkeleton', () => {
  it('renders with header by default', () => {
    const { container } = render(<CardSkeleton />);
    const header = container.querySelector('.border-b');
    expect(header).toBeTruthy();
  });

  it('renders without header when hasHeader is false', () => {
    const { container } = render(<CardSkeleton hasHeader={false} />);
    const header = container.querySelector('.px-5.py-4.border-b');
    expect(header).toBeNull();
  });

  it('renders skeleton lines when lines prop is set', () => {
    const { container } = render(<CardSkeleton lines={3} />);
    const lineBlocks = container.querySelectorAll('.space-y-3 .animate-pulse');
    expect(lineBlocks).toHaveLength(3);
  });

  it('renders chart bars when showChart is true', () => {
    const { container } = render(<CardSkeleton showChart />);
    const chartBars = container.querySelectorAll('.h-64 .animate-pulse');
    expect(chartBars.length).toBeGreaterThan(0);
  });

  it('has dark mode classes', () => {
    const { container } = render(<CardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('dark:bg-surface-800');
  });
});

describe('ChartSkeleton', () => {
  it('renders with card wrapper by default', () => {
    const { container } = render(<ChartSkeleton />);
    const card = container.querySelector('.bg-white');
    expect(card).toBeTruthy();
  });

  it('renders without card wrapper when withCard is false', () => {
    const { container } = render(<ChartSkeleton withCard={false} />);
    const card = container.querySelector('.rounded-xl.border');
    expect(card).toBeNull();
  });

  it('renders bar chart placeholders', () => {
    const { container } = render(<ChartSkeleton />);
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars.length).toBeGreaterThan(0);
  });
});

describe('PageSkeleton', () => {
  it('renders with loading status role', () => {
    const { container } = render(<PageSkeleton />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
  });

  it('has aria-label for accessibility', () => {
    const { container } = render(<PageSkeleton />);
    const status = container.querySelector('[aria-label="Loading page content"]');
    expect(status).toBeTruthy();
  });
});

describe('GallerySkeleton', () => {
  it('renders 4 gallery cards by default', () => {
    const { container } = render(<GallerySkeleton />);
    const cards = container.querySelectorAll('.rounded-xl');
    expect(cards).toHaveLength(4);
  });

  it('renders custom count of gallery cards', () => {
    const { container } = render(<GallerySkeleton count={2} />);
    const cards = container.querySelectorAll('.rounded-xl');
    expect(cards).toHaveLength(2);
  });
});

describe('ListSkeleton', () => {
  it('renders 4 list rows by default', () => {
    const { container } = render(<ListSkeleton />);
    const rows = container.querySelectorAll('.flex.items-center.gap-3');
    expect(rows).toHaveLength(4);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<ListSkeleton rows={2} />);
    const rows = container.querySelectorAll('.flex.items-center.gap-3');
    expect(rows).toHaveLength(2);
  });
});
