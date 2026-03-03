import { logger } from '../../utils/logger';

interface HttpClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class HttpClient {
  private config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig) {
    this.config = {
      headers: {},
      timeout: 30000,
      maxRetries: 3,
      ...config,
    };
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<HttpResponse<T>> {
    const url = new URL(path, this.config.baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url.toString(), {
          method,
          headers: { 'Content-Type': 'application/json', ...this.config.headers },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        const data = await response.json().catch(() => null) as T;
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k] = v; });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
        }

        return { status: response.status, data, headers };
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }
    logger.error(`HTTP request failed after ${this.config.maxRetries} retries`, { method, url: url.toString() });
    throw lastError;
  }

  setHeader(key: string, value: string): void {
    this.config.headers[key] = value;
  }
}
