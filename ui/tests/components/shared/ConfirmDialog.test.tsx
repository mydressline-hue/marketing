import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../../../src/components/shared/ConfirmDialog';

const defaultProps = {
  open: true,
  title: 'Delete Campaign',
  message: 'Are you sure you want to delete this campaign? This action cannot be undone.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete Campaign')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this campaign? This action cannot be undone.')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders default "Confirm" label on confirm button', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders default "Cancel" label on cancel button', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom confirm label', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, Delete" />);
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
  });

  it('renders custom cancel label', () => {
    render(<ConfirmDialog {...defaultProps} cancelLabel="Never Mind" />);
    expect(screen.getByText('Never Mind')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when backdrop overlay is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    const backdrop = container.querySelector('.bg-black\\/50');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when close button (X) is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    const closeButton = screen.getByLabelText('Close dialog');
    fireEvent.click(closeButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies danger variant styles by default', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    const iconContainer = container.querySelector('.bg-danger-100');
    expect(iconContainer).toBeTruthy();
  });

  it('applies warning variant styles', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} variant="warning" />);
    const iconContainer = container.querySelector('.bg-warning-100');
    expect(iconContainer).toBeTruthy();
  });

  it('applies info variant styles', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} variant="info" />);
    const iconContainer = container.querySelector('.bg-primary-100');
    expect(iconContainer).toBeTruthy();
  });

  it('has role="dialog" and aria-modal for accessibility', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('has aria-labelledby pointing to the title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-title');
    const title = document.getElementById('confirm-title');
    expect(title?.textContent).toBe('Delete Campaign');
  });

  it('has dark mode classes on the dialog container', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    const dialogBox = container.querySelector('.bg-white');
    expect(dialogBox?.className).toContain('dark:bg-surface-800');
  });
});
