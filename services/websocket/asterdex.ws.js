const WebSocket = require('ws');

class AsterdexWebSocket {
    constructor() {
        this.ws = null;
        this.data = new Map();
        this.reconnectInterval = null;
    }

    connect() {
        try {
            console.log('[Asterdex] Connecting to WebSocket...');

            // Asterdex uses Binance-like API
            // Combined stream for mark price and funding rate
            const streams = [
                '!markPrice@arr',  // All mark prices
            ];

            this.ws = new WebSocket(`wss://fstream.asterdex.com/stream?streams=${streams.join('/')}`);

            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                    console.warn('[Asterdex] Connection timeout - service may be unavailable');
                    this.ws.close();
                }
            }, 10000);

            this.ws.on('open', () => {
                clearTimeout(connectionTimeout);
                this.reconnectAttempts = 0; // Reset on successful connection
                console.log('[Asterdex] Connected');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);

                    // Handle mark price stream
                    if (message.stream === '!markPrice@arr') {
                        const tickers = message.data;

                        tickers.forEach(ticker => {
                            if (ticker.s && ticker.s.endsWith('USDT')) {
                                this.data.set(ticker.s, {
                                    symbol: ticker.s,
                                    markPrice: parseFloat(ticker.p),
                                    fundingRate: parseFloat(ticker.r) * 100, // Convert to percentage
                                    nextFundingTime: ticker.T
                                });
                            }
                        });
                    }
                } catch (error) {
                    console.error('[Asterdex] Message parsing error:', error.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('[Asterdex] WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('[Asterdex] Disconnected');
                this.reconnect();
            });

        } catch (error) {
            console.error('[Asterdex] Connection error:', error.message);
            this.reconnect();
        }
    }

    reconnect() {
        if (this.reconnectInterval) return;

        // Exponential backoff: 5s, 10s, 20s, 40s... max 60s (Asterdex may be unreliable)
        const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts || 0), 60000);
        console.log(`[Asterdex] Reconnecting in ${delay}ms...`);

        this.reconnectInterval = setTimeout(() => {
            this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
            this.reconnectInterval = null;
            this.connect();
        }, delay);
    }

    getData(symbol) {
        return this.data.get(symbol);
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

module.exports = AsterdexWebSocket;
