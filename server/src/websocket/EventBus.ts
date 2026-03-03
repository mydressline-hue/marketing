import { EventEmitter } from 'events';

class EventBusClass extends EventEmitter {
  broadcast(channel: string, data: unknown): void {
    this.emit('broadcast', { channel, data, timestamp: new Date().toISOString() });
  }
}

export const eventBus = new EventBusClass();
eventBus.setMaxListeners(50);
