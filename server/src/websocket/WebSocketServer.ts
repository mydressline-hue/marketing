import { Server as HttpServer, IncomingMessage as HttpIncomingMessage } from 'http';
import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { eventBus } from './EventBus';
import type { AuthenticatedClient, IncomingMessage, OutgoingMessage } from './types';

/** WebSocket close codes (RFC 6455 and custom range 4000-4999) */
export const WS_CLOSE_CODES = {
  /** No token was provided on the connection URL */
  MISSING_TOKEN: 4001,
  /** The token signature is invalid or the token is malformed */
  INVALID_TOKEN: 4002,
  /** The token has expired */
  TOKEN_EXPIRED: 4003,
} as const;

interface AuthenticatedRequest extends HttpIncomingMessage {
  user?: { id: string; email: string; role: string };
}

export class MarketingWebSocketServer {
  private wss: WSServer;
  private clients: Map<WebSocket, AuthenticatedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    this.wss = new WSServer({
      server,
      path: `${env.API_PREFIX}/ws`,
      verifyClient: (info, cb) => {
        try {
          const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
          const token = url.searchParams.get('token');

          if (!token) {
            logger.warn('WebSocket connection rejected: missing token');
            cb(false, 401, 'Missing authentication token');
            return;
          }

          const decoded = jwt.verify(token, env.JWT_SECRET!) as {
            id: string;
            email: string;
            role: string;
          };
          (info.req as AuthenticatedRequest).user = decoded;
          cb(true);
        } catch (error) {
          if (error instanceof jwt.TokenExpiredError) {
            logger.warn('WebSocket connection rejected: token expired');
            cb(false, 401, 'Token expired');
          } else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn('WebSocket connection rejected: invalid token');
            cb(false, 401, 'Invalid token');
          } else {
            logger.error('WebSocket connection rejected: authentication error', error as Error);
            cb(false, 401, 'Authentication failed');
          }
        }
      },
    });

    this.wss.on('connection', (ws, req) => {
      const user = (req as AuthenticatedRequest).user!;
      const client: AuthenticatedClient = {
        ws, userId: user.id, email: user.email, role: user.role,
        channels: new Set(), isAlive: true,
      };
      this.clients.set(ws, client);
      logger.info(`WebSocket connected: ${user.email}`);

      ws.on('pong', () => { client.isAlive = true; });

      ws.on('message', (raw) => {
        try {
          const msg: IncomingMessage = JSON.parse(raw.toString());
          if (msg.action === 'subscribe' && msg.channel) {
            client.channels.add(msg.channel);
          } else if (msg.action === 'unsubscribe' && msg.channel) {
            client.channels.delete(msg.channel);
          }
        } catch { /* ignore non-JSON */ }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`WebSocket disconnected: ${user.email}`);
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket error for ${user.email}:`, err);
        ws.close();
      });
    });

    // Subscribe to EventBus broadcasts
    eventBus.on('broadcast', (msg: unknown) => {
      const outgoing = msg as OutgoingMessage;
      this.broadcastToChannel(outgoing.channel, outgoing.data);
    });

    this.startHeartbeat();
    logger.info(`WebSocket server attached at ${env.API_PREFIX}/ws`);
  }

  broadcastToChannel(channel: string, data: unknown): void {
    const message = JSON.stringify({ channel, data, timestamp: new Date().toISOString() });
    for (const [, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN &&
          (client.channels.has(channel) || client.channels.has('*'))) {
        client.ws.send(message);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (!client.isAlive) { ws.terminate(); this.clients.delete(ws); continue; }
        client.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  /**
   * Forcefully disconnects all WebSocket connections belonging to a specific
   * user. Sends a custom close code so the client can distinguish a
   * server-initiated session invalidation from a normal disconnect.
   */
  disconnectUser(userId: string, code: number = WS_CLOSE_CODES.TOKEN_EXPIRED, reason: string = 'Session invalidated'): void {
    for (const [ws, client] of this.clients) {
      if (client.userId === userId) {
        logger.info(`Disconnecting WebSocket for user ${client.email}: ${reason}`);
        ws.close(code, reason);
        this.clients.delete(ws);
      }
    }
  }

  close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
