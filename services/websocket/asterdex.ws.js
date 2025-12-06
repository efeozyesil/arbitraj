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

            this.ws.on('open', () => {
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

        this.reconnectInterval = setTimeout(() => {
            console.log('[Asterdex] Reconnecting...');
            this.reconnectInterval = null;
            this.connect();
        }, 5000);
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
