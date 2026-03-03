import WebSocket from 'ws';

export interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  email: string;
  role: string;
  channels: Set<string>;
  isAlive: boolean;
}

export interface IncomingMessage {
  action: 'subscribe' | 'unsubscribe';
  channel: string;
}

export interface OutgoingMessage {
  channel: string;
  data: unknown;
  timestamp: string;
}
