const WebSocket = require('ws');

/**
 * OKX TR WebSocket Service (uses OKX global API with TRY pairs)
 * WebSocket: wss://ws.okx.com:8443/ws/v5/public
 */
class OKXTRWebSocket {
    constructor() {
        this.ws = null;
        this.data = {
            bid: 0,
            ask: 0,
            last: 0,
            timestamp: 0
        };
        this.reconnectInterval = null;
        this.reconnectAttempts = 0;
        this.pingInterval = null;
    }

    connect() {
        try {
            console.log('[OKX TR] Connecting to WebSocket...');
            this.ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

            this.ws.on('open', () => {
                console.log('[OKX TR] Connected');
                this.reconnectAttempts = 0;
                this.subscribe();
                this.startPing();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    // Ignore parse errors (pong messages etc)
                }
            });

            this.ws.on('error', (error) => {
                console.error('[OKX TR] WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('[OKX TR] Disconnected');
                this.stopPing();
                this.reconnect();
            });

        } catch (error) {
            console.error('[OKX TR] Connection error:', error.message);
            this.reconnect();
        }
    }

    subscribe() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Subscribe to USDT-TRY spot ticker
            const subscribeMsg = {
                op: 'subscribe',
                args: [
                    { channel: 'tickers', instId: 'USDT-TRY' }
                ]
            };
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log('[OKX TR] Subscribed to USDT-TRY ticker');
        }
    }

    handleMessage(message) {
        // OKX ticker format
        if (message.data && message.arg && message.arg.instId === 'USDT-TRY') {
            const ticker = message.data[0];
            if (ticker) {
                this.data = {
                    bid: parseFloat(ticker.bidPx) || 0,
                    ask: parseFloat(ticker.askPx) || 0,
                    last: parseFloat(ticker.last) || 0,
                    volume: parseFloat(ticker.vol24h) || 0,
                    timestamp: Date.now()
                };
            }
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ping');
            }
        }, 25000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    reconnect() {
        if (this.reconnectInterval) return;

        const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
        console.log(`[OKX TR] Reconnecting in ${delay}ms...`);

        this.reconnectInterval = setTimeout(() => {
            this.reconnectAttempts++;
            this.reconnectInterval = null;
            this.connect();
        }, delay);
    }

    getData() {
        return this.data;
    }

    disconnect() {
        this.stopPing();
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = OKXTRWebSocket;
