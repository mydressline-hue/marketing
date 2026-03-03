/**
 * Prometheus-Compatible In-Memory Metrics.
 *
 * Provides lightweight, dependency-free counters, gauges, and histograms
 * that can be scraped by Prometheus via the GET /metrics endpoint.
 *
 * Tracked metrics:
 *   - http_requests_total        (counter)  labels: method, path, status_code
 *   - http_request_duration_seconds (histogram) labels: method, path
 *   - active_connections          (gauge)
 *   - error_count_total           (counter)  labels: type
 *
 * All data lives in process memory -- resets on restart. This is intentional
 * for a zero-dependency setup; a production deployment would replace this
 * with prom-client or a push-based exporter.
 */

import { env } from '../../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CounterEntry {
  labels: Record<string, string>;
  value: number;
}

interface HistogramEntry {
  labels: Record<string, string>;
  count: number;
  sum: number;
  buckets: Map<number, number>; // upper bound -> cumulative count
}

// ---------------------------------------------------------------------------
// Default histogram buckets (seconds) for HTTP request duration
// ---------------------------------------------------------------------------
const DEFAULT_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------

/** http_requests_total -- counter keyed by "method|path|status_code" */
const httpRequestsTotal: Map<string, CounterEntry> = new Map();

/** http_request_duration_seconds -- histogram keyed by "method|path" */
const httpRequestDuration: Map<string, HistogramEntry> = new Map();

/** active_connections -- single gauge value */
let activeConnections = 0;

/** error_count_total -- counter keyed by error type */
const errorCountTotal: Map<string, CounterEntry> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function counterKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

/**
 * Normalise a URL path for metric labels to avoid cardinality explosion.
 * Replaces UUIDs and numeric IDs with `:id` placeholders.
 */
export function normalisePath(path: string): string {
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/\d+/g, '/:id')
    .replace(/\?.*$/, '');
}

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ---------------------------------------------------------------------------
// Public API -- Recording
// ---------------------------------------------------------------------------

/**
 * Increment the http_requests_total counter.
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
): void {
  if (!env.METRICS_ENABLED) return;

  const normPath = normalisePath(path);
  const labels = { method: method.toUpperCase(), path: normPath, status_code: String(statusCode) };
  const key = counterKey(labels);

  const existing = httpRequestsTotal.get(key);
  if (existing) {
    existing.value += 1;
  } else {
    httpRequestsTotal.set(key, { labels, value: 1 });
  }
}

/**
 * Observe an HTTP request duration (in seconds) for the histogram.
 */
export function recordHttpDuration(
  method: string,
  path: string,
  durationSeconds: number,
): void {
  if (!env.METRICS_ENABLED) return;

  const normPath = normalisePath(path);
  const labels = { method: method.toUpperCase(), path: normPath };
  const key = counterKey(labels);

  let entry = httpRequestDuration.get(key);
  if (!entry) {
    const buckets = new Map<number, number>();
    for (const bound of DEFAULT_DURATION_BUCKETS) {
      buckets.set(bound, 0);
    }
    entry = { labels, count: 0, sum: 0, buckets };
    httpRequestDuration.set(key, entry);
  }

  entry.count += 1;
  entry.sum += durationSeconds;

  for (const bound of DEFAULT_DURATION_BUCKETS) {
    if (durationSeconds <= bound) {
      entry.buckets.set(bound, (entry.buckets.get(bound) ?? 0) + 1);
    }
  }
}

/**
 * Increment the active_connections gauge.
 */
export function incrementActiveConnections(): void {
  if (!env.METRICS_ENABLED) return;
  activeConnections += 1;
}

/**
 * Decrement the active_connections gauge.
 */
export function decrementActiveConnections(): void {
  if (!env.METRICS_ENABLED) return;
  activeConnections = Math.max(0, activeConnections - 1);
}

/**
 * Get the current active_connections value (for external inspection).
 */
export function getActiveConnections(): number {
  return activeConnections;
}

/**
 * Increment the error_count_total counter for the given error type.
 */
export function recordError(errorType: string): void {
  if (!env.METRICS_ENABLED) return;

  const labels = { type: errorType };
  const key = counterKey(labels);

  const existing = errorCountTotal.get(key);
  if (existing) {
    existing.value += 1;
  } else {
    errorCountTotal.set(key, { labels, value: 1 });
  }
}

// ---------------------------------------------------------------------------
// Public API -- Prometheus Text Exposition Format
// ---------------------------------------------------------------------------

/**
 * Render all metrics in the Prometheus text exposition format (text/plain;
 * version=0.0.4).
 */
export function renderMetrics(): string {
  const lines: string[] = [];

  // -- http_requests_total (counter) --
  lines.push('# HELP http_requests_total Total number of HTTP requests.');
  lines.push('# TYPE http_requests_total counter');
  for (const entry of httpRequestsTotal.values()) {
    lines.push(`http_requests_total${formatLabels(entry.labels)} ${entry.value}`);
  }

  // -- http_request_duration_seconds (histogram) --
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds.');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const entry of httpRequestDuration.values()) {
    const lbl = entry.labels;

    // Emit cumulative bucket counts
    let cumulative = 0;
    for (const bound of DEFAULT_DURATION_BUCKETS) {
      cumulative += entry.buckets.get(bound) ?? 0;
      const bucketLabels = { ...lbl, le: String(bound) };
      lines.push(
        `http_request_duration_seconds_bucket${formatLabels(bucketLabels)} ${cumulative}`,
      );
    }
    // +Inf bucket
    const infLabels = { ...lbl, le: '+Inf' };
    lines.push(
      `http_request_duration_seconds_bucket${formatLabels(infLabels)} ${entry.count}`,
    );

    lines.push(
      `http_request_duration_seconds_sum${formatLabels(lbl)} ${entry.sum}`,
    );
    lines.push(
      `http_request_duration_seconds_count${formatLabels(lbl)} ${entry.count}`,
    );
  }

  // -- active_connections (gauge) --
  lines.push('# HELP active_connections Number of currently active connections.');
  lines.push('# TYPE active_connections gauge');
  lines.push(`active_connections ${activeConnections}`);

  // -- error_count_total (counter) --
  lines.push('# HELP error_count_total Total number of errors by type.');
  lines.push('# TYPE error_count_total counter');
  for (const entry of errorCountTotal.values()) {
    lines.push(`error_count_total${formatLabels(entry.labels)} ${entry.value}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Reset all metrics. Primarily useful for tests.
 */
export function resetMetrics(): void {
  httpRequestsTotal.clear();
  httpRequestDuration.clear();
  activeConnections = 0;
  errorCountTotal.clear();
}
