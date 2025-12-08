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
            bids: [], // Top 3 bids
            asks: [], // Top 3 asks
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
            const tickerMsg = [151, { type: 151, channel: 'ticker', event: 'USDTTRY', join: true }];
            this.ws.send(JSON.stringify(tickerMsg));

            // Subscribe to USDTTRY orderbook
            const orderbookMsg = [151, { type: 151, channel: 'orderbook', event: 'USDTTRY', join: true }];
            this.ws.send(JSON.stringify(orderbookMsg));

            console.log('[BTCTurk] Subscribed to USDTTRY ticker and orderbook');
        }
    }

    handleMessage(message) {
        // BTCTurk sends array format [channel, data]
        if (Array.isArray(message) && message.length >= 2) {
            const channel = message[0];
            const data = message[1];

            // Channel 402 = TickerPair
            if (channel === 402 && data.PS === 'USDTTRY') {
                this.data.bid = parseFloat(data.B) || this.data.bid;
                this.data.ask = parseFloat(data.A) || this.data.ask;
                this.data.last = parseFloat(data.LA) || this.data.last;
                this.data.timestamp = Date.now();
            }

            // Channel 431 = OrderBookFull
            if (channel === 431 && data.PS === 'USDTTRY') {
                // Bids: sorted high to low
                if (data.B && Array.isArray(data.B)) {
                    this.data.bids = data.B.slice(0, 3).map(b => ({
                        price: parseFloat(b.P),
                        amount: parseFloat(b.A)
                    }));
                }
                // Asks: sorted low to high
                if (data.A && Array.isArray(data.A)) {
                    this.data.asks = data.A.slice(0, 3).map(a => ({
                        price: parseFloat(a.P),
                        amount: parseFloat(a.A)
                    }));
                }

                // Update best bid/ask from orderbook
                if (this.data.bids.length > 0) {
                    this.data.bid = this.data.bids[0].price;
                }
                if (this.data.asks.length > 0) {
                    this.data.ask = this.data.asks[0].price;
                }
                this.data.timestamp = Date.now();
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
