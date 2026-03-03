import { Server as HttpServer, IncomingMessage as HttpIncomingMessage } from 'http';
import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { eventBus } from './EventBus';
import type { AuthenticatedClient, IncomingMessage, OutgoingMessage } from './types';

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
          if (!token) { cb(false, 401, 'Missing token'); return; }
          const decoded = jwt.verify(token, env.JWT_SECRET!) as { id: string; email: string; role: string };
          (info.req as AuthenticatedRequest).user = decoded;
          cb(true);
        } catch {
          cb(false, 401, 'Invalid token');
        }
      }
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

  close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
