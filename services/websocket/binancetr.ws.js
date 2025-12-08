const WebSocket = require('ws');

/**
 * Binance TR WebSocket Service
 * WebSocket: wss://stream-tr.2meta.app/ws
 * Docs: https://binance-docs.github.io/apidocs/spot/en
 */
class BinanceTRWebSocket {
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
            console.log('[Binance TR] Connecting to WebSocket...');
            // Binance TR uses combined streams
            this.ws = new WebSocket('wss://stream-tr.2meta.app/ws/usdttry@ticker');

            this.ws.on('open', () => {
                console.log('[Binance TR] Connected');
                this.reconnectAttempts = 0;
                this.startPing();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    // Ignore parse errors
                }
            });

            this.ws.on('error', (error) => {
                console.error('[Binance TR] WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('[Binance TR] Disconnected');
                this.stopPing();
                this.reconnect();
            });

        } catch (error) {
            console.error('[Binance TR] Connection error:', error.message);
            this.reconnect();
        }
    }

    handleMessage(message) {
        // Binance ticker format
        if (message.e === '24hrTicker' && message.s === 'USDTTRY') {
            this.data = {
                bid: parseFloat(message.b) || 0,   // Best bid price
                ask: parseFloat(message.a) || 0,   // Best ask price
                last: parseFloat(message.c) || 0,  // Last price
                volume: parseFloat(message.v) || 0,
                timestamp: Date.now()
            };
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, 30000);
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
        console.log(`[Binance TR] Reconnecting in ${delay}ms...`);

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

module.exports = BinanceTRWebSocket;
