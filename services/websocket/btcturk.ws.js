const WebSocket = require('ws');
const axios = require('axios');

/**
 * BTCTurk WebSocket + REST API Service
 * WebSocket for ticker, REST for orderbook
 */
class BTCTurkWebSocket {
    constructor() {
        this.ws = null;
        this.data = {
            bid: 0,
            ask: 0,
            last: 0,
            bids: [],
            asks: [],
            timestamp: 0
        };
        this.reconnectInterval = null;
        this.reconnectAttempts = 0;
        this.orderbookInterval = null;
    }

    connect() {
        try {
            console.log('[BTCTurk] Connecting to WebSocket...');
            this.ws = new WebSocket('wss://ws-feed-pro.btcturk.com');

            this.ws.on('open', () => {
                console.log('[BTCTurk] Connected');
                this.reconnectAttempts = 0;
                this.subscribe();
                // Start orderbook polling via REST API
                this.startOrderbookPolling();
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
                this.stopOrderbookPolling();
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
                this.data.bid = parseFloat(data.B) || this.data.bid;
                this.data.ask = parseFloat(data.A) || this.data.ask;
                this.data.last = parseFloat(data.LA) || this.data.last;
                this.data.timestamp = Date.now();
            }
        }
    }

    startOrderbookPolling() {
        // Initial fetch
        this.fetchOrderbook();
        // Poll every 2 seconds
        this.orderbookInterval = setInterval(() => this.fetchOrderbook(), 2000);
    }

    stopOrderbookPolling() {
        if (this.orderbookInterval) {
            clearInterval(this.orderbookInterval);
            this.orderbookInterval = null;
        }
    }

    async fetchOrderbook() {
        try {
            const response = await axios.get('https://api.btcturk.com/api/v2/orderbook', {
                params: { pairSymbol: 'USDTTRY' },
                timeout: 5000
            });

            if (response.data && response.data.data) {
                const ob = response.data.data;

                // Bids: [[price, amount], ...] - high to low
                if (ob.bids && Array.isArray(ob.bids)) {
                    this.data.bids = ob.bids.slice(0, 3).map(b => ({
                        price: parseFloat(b[0]),
                        amount: parseFloat(b[1])
                    }));
                    if (this.data.bids.length > 0) {
                        this.data.bid = this.data.bids[0].price;
                    }
                }

                // Asks: [[price, amount], ...] - low to high
                if (ob.asks && Array.isArray(ob.asks)) {
                    this.data.asks = ob.asks.slice(0, 3).map(a => ({
                        price: parseFloat(a[0]),
                        amount: parseFloat(a[1])
                    }));
                    if (this.data.asks.length > 0) {
                        this.data.ask = this.data.asks[0].price;
                    }
                }

                this.data.timestamp = Date.now();
            }
        } catch (error) {
            // Silent fail - ticker still works
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
        this.stopOrderbookPolling();
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
