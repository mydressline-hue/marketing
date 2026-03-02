import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We import the named export so we get the singleton, then test its methods
// against a mocked global `fetch`.
// ---------------------------------------------------------------------------

// Re-import fresh module for each describe block to avoid apiKey leaking.
// We use dynamic import inside tests, but for the main suite we import
// at the top level for convenience.
import { api } from '../../src/services/api';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Helper to create a successful Response mock. */
function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

/** Helper to create a failed Response mock. */
function errorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ error: statusText }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiService', () => {
  it('should make a GET request to the correct URL', async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [] }));

    const result = await api.get('/v1/campaigns');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/campaigns',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ items: [] });
  });

  it('should make a POST request with JSON body', async () => {
    const payload = { name: 'New Campaign' };
    mockFetch.mockResolvedValue(okResponse({ id: 1, ...payload }));

    const result = await api.post('/v1/campaigns', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/campaigns',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ id: 1, name: 'New Campaign' });
  });

  it('should make a PUT request with JSON body', async () => {
    const payload = { name: 'Updated' };
    mockFetch.mockResolvedValue(okResponse({ id: 1, ...payload }));

    const result = await api.put('/v1/campaigns/1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/campaigns/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ id: 1, name: 'Updated' });
  });

  it('should make a PATCH request with JSON body', async () => {
    const payload = { status: 'active' };
    mockFetch.mockResolvedValue(okResponse({ id: 1, status: 'active' }));

    const result = await api.patch('/v1/campaigns/1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/campaigns/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual({ id: 1, status: 'active' });
  });

  it('should make a DELETE request', async () => {
    mockFetch.mockResolvedValue(okResponse({ deleted: true }));

    const result = await api.delete('/v1/campaigns/1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/campaigns/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result).toEqual({ deleted: true });
  });

  it('should include Content-Type: application/json header on all requests', async () => {
    mockFetch.mockResolvedValue(okResponse({}));

    await api.get('/v1/test');

    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders['Content-Type']).toBe('application/json');
  });

  it('should include Authorization header when API key is set', async () => {
    mockFetch.mockResolvedValue(okResponse({}));

    api.setApiKey('test-secret-key');

    await api.get('/v1/protected');

    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders['Authorization']).toBe('Bearer test-secret-key');

    // Clean up so subsequent tests aren't affected.
    // ApiService stores the key on the singleton. We set it to something
    // neutral to prevent leaking. (The service has no clearApiKey method.)
    api.setApiKey('');
  });

  it('should not include Authorization header when no API key is set', async () => {
    // Reset the key by setting empty string and verifying behaviour.
    api.setApiKey('');
    mockFetch.mockResolvedValue(okResponse({}));

    await api.get('/v1/public');

    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    // When apiKey is '' (falsy), the Authorization header should NOT be set.
    // Note: The implementation checks `if (this.apiKey)`, so '' is falsy.
    expect(calledHeaders['Authorization']).toBeUndefined();
  });

  it('should throw an error when the response is not OK', async () => {
    mockFetch.mockResolvedValue(errorResponse(404, 'Not Found'));

    await expect(api.get('/v1/missing')).rejects.toThrow(
      'API Error: 404 Not Found',
    );
  });

  it('should throw an error for server errors (500)', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, 'Internal Server Error'));

    await expect(api.post('/v1/test', {})).rejects.toThrow(
      'API Error: 500 Internal Server Error',
    );
  });

  it('should use /api as the base URL by default', async () => {
    mockFetch.mockResolvedValue(okResponse({}));

    await api.get('/v1/endpoint');

    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/endpoint');
  });
});
