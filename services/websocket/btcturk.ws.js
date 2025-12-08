const WebSocket = require('ws');

/**
 * BTCTurk WebSocket Service
 * API Docs: https://docs.btcturk.com
 * WebSocket: wss://ws-feed-pro.btcturk.com
 */
class BTCTurkWebSocket {
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
    }

    connect() {
        try {
            console.log('[BTCTurk] Connecting to WebSocket...');
            this.ws = new WebSocket('wss://ws-feed-pro.btcturk.com');

            this.ws.on('open', () => {
                console.log('[BTCTurk] Connected');
                this.reconnectAttempts = 0;
                this.subscribe();
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
                console.error('[BTCTurk] WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('[BTCTurk] Disconnected');
                this.reconnect();
            });

        } catch (error) {
            console.error('[BTCTurk] Connection error:', error.message);
            this.reconnect();
        }
    }

    subscribe() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Subscribe to USDTTRY ticker
            const subscribeMsg = [
                151, // Join channel
                {
                    type: 151,
                    channel: 'ticker',
                    event: 'USDTTRY',
                    join: true
                }
            ];
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log('[BTCTurk] Subscribed to USDTTRY ticker');
        }
    }

    handleMessage(message) {
        // BTCTurk sends array format [channel, data]
        if (Array.isArray(message) && message.length >= 2) {
            const channel = message[0];
            const data = message[1];

            // Channel 402 = TickerPair
            if (channel === 402 && data.PS === 'USDTTRY') {
                this.data = {
                    bid: parseFloat(data.B) || 0,   // Best bid
                    ask: parseFloat(data.A) || 0,   // Best ask
                    last: parseFloat(data.LA) || 0, // Last price
                    volume: parseFloat(data.V) || 0,
                    timestamp: Date.now()
                };
            }
        }
    }

    reconnect() {
        if (this.reconnectInterval) return;

        const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
        console.log(`[BTCTurk] Reconnecting in ${delay}ms...`);

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
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = BTCTurkWebSocket;
