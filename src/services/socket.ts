type EventCallback = (data: any) => void;

class SocketService {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;
  private isConnecting = false;

  public connect(token: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.token = token;
    this.isExplicitlyClosed = false;

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log('[CipherChat WS] Connected to secure WebSocket server');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.emit('connection:status', { connected: true });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type) {
            this.emit(data.type, data);
          }
        } catch (err) {
          console.error('[CipherChat WS] Failed to parse message', err);
        }
      };

      this.socket.onclose = (event) => {
        this.isConnecting = false;
        this.socket = null;
        this.emit('connection:status', { connected: false, code: event.code });

        if (!this.isExplicitlyClosed && this.token) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[CipherChat WS] Error encountered:', err);
      };
    } catch (err) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token && !this.isExplicitlyClosed) {
        this.connect(this.token);
      }
    }, 3000);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  public on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unbind function
    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
      }
    };
  }

  public emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in WS listener for ${event}:`, err);
        }
      });
    }
  }

  public send(data: any): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  public sendTyping(recipientId: string, conversationId: string, isTyping: boolean): void {
    this.send({
      type: isTyping ? 'typing:start' : 'typing:stop',
      recipientId,
      conversationId,
    });
  }

  public sendReadReceipt(messageId: string, conversationId: string): void {
    this.send({
      type: 'message:read',
      messageId,
      conversationId,
    });
  }

  public checkPresence(targetUserIds: string[]): void {
    this.send({
      type: 'presence:check',
      targetUserIds,
    });
  }
}

export const socketService = new SocketService();
