import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useApiQuery, useApiMutation } from '../../src/hooks/useApi';
import { QueryProvider } from '../../src/providers/QueryProvider';

// Mock the api service
vi.mock('../../src/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../src/services/api';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, children);

describe('useApiQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data on mount', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 1, name: 'test' });
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 1, name: 'test' });
    expect(result.current.error).toBeNull();
  });

  it('should set error on fetch failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('should not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useApiQuery('/v1/test', { enabled: false }),
      { wrapper }
    );

    expect(result.current.loading).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('should support refetch', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ count: 1 }));

    vi.mocked(api.get).mockResolvedValue({ count: 2 });
    await act(async () => { await result.current.refetch(); });

    await waitFor(() => expect(result.current.data).toEqual({ count: 2 }));
  });

  it('should serialize params into cache key', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result } = renderHook(
      () => useApiQuery('/v1/test', { params: { country: 'US', page: 1 } }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('country=US'));
  });

  it('should handle params with undefined values', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderHook(
      () => useApiQuery('/v1/test', { params: { country: 'US', filter: undefined } }),
      { wrapper }
    );

    await waitFor(() => {
      const calledWith = vi.mocked(api.get).mock.calls[0]?.[0] ?? '';
      expect(calledWith).toContain('country=US');
      expect(calledWith).not.toContain('filter');
    });
  });

  it('should use cache for subsequent calls with same key', async () => {
    vi.mocked(api.get).mockResolvedValue({ cached: true });
    const { result } = renderHook(() => useApiQuery('/v1/cached'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ cached: true }));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('should handle polling with refetchInterval', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue({ polled: true });

    renderHook(
      () => useApiQuery('/v1/test', { refetchInterval: 5000 }),
      { wrapper }
    );

    expect(api.get).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('should skip cache when skipCache is true', async () => {
    vi.mocked(api.get).mockResolvedValue({ fresh: true });
    const { result } = renderHook(
      () => useApiQuery('/v1/test', { skipCache: true }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
  });

  it('should return loading true initially', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it('should handle empty response', async () => {
    vi.mocked(api.get).mockResolvedValue(null);
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('should handle array response', async () => {
    vi.mocked(api.get).mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useApiQuery<number[]>('/v1/test'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));
  });

  it('should convert non-Error thrown values to Error', async () => {
    vi.mocked(api.get).mockRejectedValue('string error');
    const { result } = renderHook(() => useApiQuery('/v1/test'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });
});

describe('useApiMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute POST mutation', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 1 });
    const { result } = renderHook(
      () => useApiMutation('/v1/test', { method: 'POST' }),
      { wrapper }
    );

    let response: unknown;
    await act(async () => { response = await result.current.mutate({ name: 'test' }); });

    expect(response).toEqual({ id: 1 });
    expect(api.post).toHaveBeenCalledWith('/v1/test', { name: 'test' });
  });

  it('should execute PUT mutation', async () => {
    vi.mocked(api.put).mockResolvedValue({ updated: true });
    const { result } = renderHook(
      () => useApiMutation('/v1/test', { method: 'PUT' }),
      { wrapper }
    );

    await act(async () => { await result.current.mutate({ name: 'updated' }); });
    expect(api.put).toHaveBeenCalledWith('/v1/test', { name: 'updated' });
  });

  it('should execute DELETE mutation', async () => {
    vi.mocked(api.delete).mockResolvedValue({ deleted: true });
    const { result } = renderHook(
      () => useApiMutation('/v1/test', { method: 'DELETE' }),
      { wrapper }
    );

    await act(async () => { await result.current.mutate(); });
    expect(api.delete).toHaveBeenCalledWith('/v1/test');
  });

  it('should set loading during mutation', async () => {
    let resolvePromise: (v: unknown) => void;
    vi.mocked(api.post).mockImplementation(() => new Promise(r => { resolvePromise = r; }));
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    expect(result.current.loading).toBe(false);

    let mutatePromise: Promise<unknown>;
    act(() => { mutatePromise = result.current.mutate({}); });

    expect(result.current.loading).toBe(true);

    await act(async () => { resolvePromise!({ done: true }); await mutatePromise!; });
    expect(result.current.loading).toBe(false);
  });

  it('should handle mutation error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    await act(async () => { await result.current.mutate({}); });

    expect(result.current.error?.message).toBe('Server error');
  });

  it('should call onSuccess callback', async () => {
    const onSuccess = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ id: 1 });
    const { result } = renderHook(
      () => useApiMutation('/v1/test', { onSuccess }),
      { wrapper }
    );

    await act(async () => { await result.current.mutate({}); });
    expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();
    vi.mocked(api.post).mockRejectedValue(new Error('fail'));
    const { result } = renderHook(
      () => useApiMutation('/v1/test', { onError }),
      { wrapper }
    );

    await act(async () => { await result.current.mutate({}); });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should reset state', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    await act(async () => { await result.current.mutate({}); });
    expect(result.current.data).toEqual({ id: 1 });

    act(() => { result.current.reset(); });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should default to POST method', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    await act(async () => { await result.current.mutate({}); });
    expect(api.post).toHaveBeenCalled();
  });

  it('should return null on error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    let response: unknown;
    await act(async () => { response = await result.current.mutate({}); });
    expect(response).toBeNull();
  });

  it('should convert non-Error to Error', async () => {
    vi.mocked(api.post).mockRejectedValue('string error');
    const { result } = renderHook(() => useApiMutation('/v1/test'), { wrapper });

    await act(async () => { await result.current.mutate({}); });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
