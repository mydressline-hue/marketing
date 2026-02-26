import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryProvider } from '../../src/providers/QueryProvider';
import { useApiQuery, useApiMutation } from '../../src/hooks/useApi';

// --- Test setup ---

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, children);

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createFetchResponse<T>(data: T, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// --- useApiQuery tests ---

describe('useApiQuery', () => {
  it('fetches data on mount', async () => {
    const mockData = { id: 1, name: 'Test Market' };
    mockFetch.mockReturnValueOnce(createFetchResponse(mockData));

    const { result } = renderHook(
      () => useApiQuery('test-key', '/markets'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/markets'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('shows loading state while fetching', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(
      () => useApiQuery('loading-test', '/slow-endpoint'),
      { wrapper }
    );

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);

    // Resolve the fetch
    resolvePromise!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ loaded: true }),
      text: () => Promise.resolve('{"loaded":true}'),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ loaded: true });
  });

  it('handles errors gracefully', async () => {
    mockFetch.mockReturnValueOnce(
      createFetchResponse({ error: 'Not Found' }, false, 404)
    );

    const onError = vi.fn();

    const { result } = renderHook(
      () => useApiQuery('error-test', '/nonexistent', { onError }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('API Error 404');
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('handles network failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(
      () => useApiQuery('network-error-test', '/unreachable'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useApiQuery('disabled-test', '/endpoint', { enabled: false }),
      { wrapper }
    );

    // Give time for any async operations
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('refetch re-fetches data and updates state', async () => {
    const initialData = { count: 1 };
    const refreshedData = { count: 2 };

    mockFetch
      .mockReturnValueOnce(createFetchResponse(initialData))
      .mockReturnValueOnce(createFetchResponse(refreshedData));

    const { result } = renderHook(
      () => useApiQuery('refetch-test', '/counter'),
      { wrapper }
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.data).toEqual(initialData);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Trigger refetch
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(refreshedData);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('calls onSuccess callback with fetched data', async () => {
    const mockData = { success: true };
    mockFetch.mockReturnValueOnce(createFetchResponse(mockData));

    const onSuccess = vi.fn();

    renderHook(
      () => useApiQuery('success-cb-test', '/data', { onSuccess }),
      { wrapper }
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockData);
    });
  });
});

// --- useApiMutation tests ---

describe('useApiMutation', () => {
  it('triggers mutation on mutate() call', async () => {
    const responseData = { id: 1, created: true };
    mockFetch.mockReturnValueOnce(createFetchResponse(responseData));

    const { result } = renderHook(
      () => useApiMutation('/campaigns', 'POST'),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutate({ name: 'New Campaign' });
    });

    expect(mutationResult).toEqual(responseData);
    expect(result.current.data).toEqual(responseData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/campaigns'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New Campaign' }),
      })
    );
  });

  it('handles mutation errors', async () => {
    mockFetch.mockReturnValueOnce(
      createFetchResponse({ error: 'Validation failed' }, false, 422)
    );

    const onError = vi.fn();

    const { result } = renderHook(
      () => useApiMutation('/campaigns', 'POST', { onError }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({ name: '' });
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toContain('API Error 422');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { name: '' });
  });

  it('calls onSuccess callback after successful mutation', async () => {
    const responseData = { id: 2, updated: true };
    mockFetch.mockReturnValueOnce(createFetchResponse(responseData));

    const onSuccess = vi.fn();

    const { result } = renderHook(
      () => useApiMutation('/campaigns/2', 'PUT', { onSuccess }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({ name: 'Updated Campaign' });
    });

    expect(onSuccess).toHaveBeenCalledWith(responseData, { name: 'Updated Campaign' });
  });

  it('resets state on reset() call', async () => {
    const responseData = { id: 1 };
    mockFetch.mockReturnValueOnce(createFetchResponse(responseData));

    const { result } = renderHook(
      () => useApiMutation('/test', 'POST'),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({ data: 'test' });
    });

    expect(result.current.data).toEqual(responseData);

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('supports DELETE method', async () => {
    mockFetch.mockReturnValueOnce(createFetchResponse({ deleted: true }));

    const { result } = renderHook(
      () => useApiMutation('/campaigns/5', 'DELETE'),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({});
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/campaigns/5'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
