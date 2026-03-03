/**
 * Redis-backed EventBus.
 *
 * Replaces the in-process Node.js EventEmitter with Redis pub/sub so that
 * events propagate across all server instances in a multi-process or
 * multi-server deployment.
 *
 * A **separate** Redis connection is used for subscriptions (required by
 * the Redis pub/sub protocol -- a client in subscriber mode cannot issue
 * regular commands).
 *
 * The public surface (`emit`, `on`, `off`, `broadcast`) is kept identical
 * to the previous EventEmitter-based implementation so that existing
 * consumers (e.g. WebSocketServer) continue to work without changes.
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Channel prefix -- namespaces all EventBus messages in Redis
// ---------------------------------------------------------------------------
const CHANNEL_PREFIX = 'eventbus:';

// ---------------------------------------------------------------------------
// Helper: create a Redis client with shared options
// ---------------------------------------------------------------------------
function createRedisClient(label: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error(`Redis EventBus (${label}): max retry attempts reached. Giving up.`);
        return null;
      }
      const delay = Math.min(times * 500, 5000);
      logger.warn(
        `Redis EventBus (${label}): reconnecting in ${delay}ms (attempt ${times})...`,
      );
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on('connect', () => {
    logger.info(`Redis EventBus (${label}): connected.`);
  });

  client.on('ready', () => {
    logger.info(`Redis EventBus (${label}): ready.`);
  });

  client.on('error', (err: Error) => {
    logger.warn(`Redis EventBus (${label}) error: ${err.message}`);
  });

  client.on('close', () => {
    logger.warn(`Redis EventBus (${label}): connection closed.`);
  });

  return client;
}

// ---------------------------------------------------------------------------
// EventBus class
// ---------------------------------------------------------------------------

/**
 * Maintains backward compatibility with the previous EventEmitter API while
 * routing all events through Redis pub/sub under the hood.
 *
 * - `emit(event, ...args)` publishes a JSON-serialised message to Redis.
 * - `on(event, listener)` subscribes to the corresponding Redis channel
 *   and dispatches received messages to the local listener.
 * - `off(event, listener)` removes the local listener (unsubscribes from
 *   the Redis channel when no listeners remain for that event).
 * - `broadcast(channel, data)` is a convenience that emits the `broadcast`
 *   event with the standard `{ channel, data, timestamp }` shape expected
 *   by the WebSocketServer.
 */
class EventBusClass {
  /** Publisher connection -- used for redis.publish(). */
  private pub: Redis;

  /** Subscriber connection -- used for redis.subscribe() + message handler. */
  private sub: Redis;

  /**
   * Local emitter used to fan-out received Redis messages to in-process
   * listeners that registered via `on()`.
   */
  private localEmitter: EventEmitter;

  /** Tracks which Redis channels we are subscribed to. */
  private subscribedChannels: Set<string> = new Set();

  /** Whether `init()` has been called. */
  private _initialised = false;

  /** Whether `close()` has been called. */
  private _closed = false;

  constructor() {
    this.pub = createRedisClient('pub');
    this.sub = createRedisClient('sub');
    this.localEmitter = new EventEmitter();
    this.localEmitter.setMaxListeners(50);

    // Handle incoming messages from Redis and dispatch locally.
    this.sub.on('message', (redisChannel: string, message: string) => {
      // Strip the channel prefix to recover the original event name.
      const eventName = redisChannel.startsWith(CHANNEL_PREFIX)
        ? redisChannel.slice(CHANNEL_PREFIX.length)
        : redisChannel;

      try {
        const parsed = JSON.parse(message);
        this.localEmitter.emit(eventName, ...((parsed as { args: unknown[] }).args ?? []));
      } catch {
        // If the payload is not valid JSON, forward the raw string.
        logger.warn(`EventBus: failed to parse message on channel "${eventName}".`);
        this.localEmitter.emit(eventName, message);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Connect both Redis clients. Should be called once during server startup
   * (after the main Redis connection has been established). Failures are
   * logged but do **not** crash the process -- the EventBus will simply
   * operate in a degraded state.
   */
  async init(): Promise<void> {
    if (this._initialised) return;

    try {
      const pubStatus = this.pub.status;
      if (pubStatus === 'wait' || pubStatus === 'end' || pubStatus === 'close') {
        await this.pub.connect();
      }

      const subStatus = this.sub.status;
      if (subStatus === 'wait' || subStatus === 'end' || subStatus === 'close') {
        await this.sub.connect();
      }

      this._initialised = true;
      logger.info('EventBus: Redis pub/sub initialised.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `EventBus: Redis pub/sub initialisation failed: ${message}. Events will not propagate across processes.`,
      );
    }
  }

  /**
   * Gracefully close both Redis connections.
   */
  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;

    try {
      if (this.subscribedChannels.size > 0) {
        await this.sub.unsubscribe(...Array.from(this.subscribedChannels));
        this.subscribedChannels.clear();
      }
      await this.sub.quit();
      await this.pub.quit();
      logger.info('EventBus: Redis pub/sub connections closed.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`EventBus: error during close: ${message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Public API (backward-compatible with the previous EventEmitter surface)
  // -----------------------------------------------------------------------

  /**
   * Publish an event. Serialises all arguments as JSON and publishes them
   * to the corresponding Redis channel.
   */
  emit(event: string, ...args: unknown[]): boolean {
    const redisChannel = `${CHANNEL_PREFIX}${event}`;
    const payload = JSON.stringify({ args });

    // Fire-and-forget publish. Errors are caught to avoid crashing callers.
    this.pub.publish(redisChannel, payload).catch((err: Error) => {
      logger.warn(`EventBus: publish to "${event}" failed: ${err.message}`);
    });

    // Return true to match the EventEmitter.emit() contract.
    return true;
  }

  /**
   * Register a listener for an event. Subscribes to the Redis channel the
   * first time a listener is registered for a given event name.
   */
  on(event: string, listener: (...args: unknown[]) => void): this {
    const redisChannel = `${CHANNEL_PREFIX}${event}`;

    // Subscribe to the Redis channel if this is the first local listener.
    if (!this.subscribedChannels.has(redisChannel)) {
      this.subscribedChannels.add(redisChannel);

      this.sub.subscribe(redisChannel).catch((err: Error) => {
        logger.warn(
          `EventBus: subscribe to "${event}" failed: ${err.message}`,
        );
        this.subscribedChannels.delete(redisChannel);
      });
    }

    this.localEmitter.on(event, listener);
    return this;
  }

  /**
   * Remove a listener. If no listeners remain for the event, unsubscribes
   * from the Redis channel.
   */
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.localEmitter.off(event, listener);

    if (this.localEmitter.listenerCount(event) === 0) {
      const redisChannel = `${CHANNEL_PREFIX}${event}`;

      if (this.subscribedChannels.has(redisChannel)) {
        this.subscribedChannels.delete(redisChannel);

        this.sub.unsubscribe(redisChannel).catch((err: Error) => {
          logger.warn(
            `EventBus: unsubscribe from "${event}" failed: ${err.message}`,
          );
        });
      }
    }

    return this;
  }

  // -----------------------------------------------------------------------
  // Convenience
  // -----------------------------------------------------------------------

  /**
   * Broadcast a message on a named channel. This is the primary method
   * used by services to push real-time updates to WebSocket clients.
   */
  broadcast(channel: string, data: unknown): void {
    this.emit('broadcast', { channel, data, timestamp: new Date().toISOString() });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const eventBus = new EventBusClass();
