import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from '../../../src/components/shared/DataTable';

interface TestRow {
  id: number;
  name: string;
  status: string;
  [key: string]: unknown;
}

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

const data: TestRow[] = [
  { id: 1, name: 'Campaign A', status: 'active' },
  { id: 2, name: 'Campaign B', status: 'paused' },
  { id: 3, name: 'Campaign C', status: 'draft' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders all data rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Campaign A')).toBeInTheDocument();
    expect(screen.getByText('Campaign B')).toBeInTheDocument();
    expect(screen.getByText('Campaign C')).toBeInTheDocument();
  });

  it('renders cell values from data using column keys', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('renders custom cell content via render prop', () => {
    const customColumns = [
      { key: 'name', label: 'Name' },
      {
        key: 'status',
        label: 'Status',
        render: (item: TestRow) => <span data-testid="custom-status">{item.status.toUpperCase()}</span>,
      },
    ];
    render(<DataTable columns={customColumns} data={data} />);
    const customCells = screen.getAllByTestId('custom-status');
    expect(customCells).toHaveLength(3);
    expect(customCells[0]).toHaveTextContent('ACTIVE');
  });

  it('renders an empty table body when data is empty', () => {
    const { container } = render(<DataTable columns={columns} data={[]} />);
    const tbody = container.querySelector('tbody');
    expect(tbody).toBeTruthy();
    expect(tbody!.children).toHaveLength(0);
  });

  it('calls onRowClick with the row item when a row is clicked', () => {
    const handleClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={handleClick} />);
    fireEvent.click(screen.getByText('Campaign A'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(data[0]);
  });

  it('adds cursor-pointer class when onRowClick is provided', () => {
    const handleClick = vi.fn();
    const { container } = render(<DataTable columns={columns} data={data} onRowClick={handleClick} />);
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.className).toContain('cursor-pointer');
  });

  it('does not add cursor-pointer when onRowClick is not provided', () => {
    const { container } = render(<DataTable columns={columns} data={data} />);
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.className).not.toContain('cursor-pointer');
  });

  it('applies custom className to columns', () => {
    const columnsWithClass = [
      { key: 'name', label: 'Name', className: 'w-1/2' },
      { key: 'status', label: 'Status' },
    ];
    const { container } = render(<DataTable columns={columnsWithClass} data={data} />);
    const th = container.querySelector('th');
    expect(th?.className).toContain('w-1/2');
  });

  it('has dark mode classes on table header', () => {
    const { container } = render(<DataTable columns={columns} data={data} />);
    const headerRow = container.querySelector('thead tr');
    expect(headerRow?.className).toContain('dark:border-surface-700');
  });
});
