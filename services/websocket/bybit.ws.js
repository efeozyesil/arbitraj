const WebSocket = require('ws');

class BybitWebSocket {
    constructor(symbols = []) {
        this.ws = null;
        this.data = new Map();
        this.symbols = symbols.length > 0 ? symbols : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        this.reconnectInterval = null;
        this.pingInterval = null;
    }

    connect() {
        try {
            console.log('[Bybit] Connecting to WebSocket...');
            this.ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

            this.ws.on('open', () => {
                console.log('[Bybit] Connected');
                this.subscribe();
                this.startPing();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);

                    // Handle ticker updates (price only, funding comes from REST API)
                    if (message.topic && message.topic.startsWith('tickers.')) {
                        const tickerData = message.data;
                        const symbol = tickerData.symbol;

                        const existingData = this.data.get(symbol) || {};
                        this.data.set(symbol, {
                            symbol: symbol,
                            markPrice: parseFloat(tickerData.markPrice || tickerData.lastPrice),
                            fundingRate: existingData.fundingRate || 0,
                            nextFundingTime: existingData.nextFundingTime || Date.now()
                        });
                    }
                } catch (error) {
                    console.error('[Bybit] Message parsing error:', error.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('[Bybit] WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('[Bybit] Disconnected');
                this.stopPing();
                this.reconnect();
            });

        } catch (error) {
            console.error('[Bybit] Connection error:', error.message);
            this.reconnect();
        }
    }

    subscribe() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Subscribe to tickers (for price) and instrument info (for funding rate)
            const tickerArgs = this.symbols.map(symbol => `tickers.${symbol}`);

            const subscribeMessage = {
                op: 'subscribe',
                args: tickerArgs
            };

            this.ws.send(JSON.stringify(subscribeMessage));
            console.log(`[Bybit] Subscribed to ${this.symbols.length} symbols`);

            // Fetch funding rates via REST API initially
            this.fetchFundingRates();

            // Update funding rates every 30 seconds
            setInterval(() => this.fetchFundingRates(), 30000);
        }
    }

    async fetchFundingRates() {
        try {
            const axios = require('axios');
            const response = await axios.get('https://api.bybit.com/v5/market/tickers', {
                params: { category: 'linear' }
            });

            if (response.data && response.data.result && response.data.result.list) {
                response.data.result.list.forEach(ticker => {
                    if (this.symbols.includes(ticker.symbol)) {
                        const existingData = this.data.get(ticker.symbol) || {};
                        this.data.set(ticker.symbol, {
                            symbol: ticker.symbol,
                            markPrice: existingData.markPrice || parseFloat(ticker.markPrice),
                            fundingRate: parseFloat(ticker.fundingRate) * 100, // Convert to percentage
                            nextFundingTime: ticker.nextFundingTime
                        });
                    }
                });
            }
        } catch (error) {
            console.error('[Bybit] Funding rate fetch error:', error.message);
        }
    }

    startPing() {
        // Bybit requires ping every 20 seconds
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ op: 'ping' }));
            }
        }, 20000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    reconnect() {
        if (this.reconnectInterval) return;

        this.reconnectInterval = setTimeout(() => {
            console.log('[Bybit] Reconnecting...');
            this.reconnectInterval = null;
            this.connect();
        }, 5000);
    }

    getData(symbol) {
        return this.data.get(symbol);
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

module.exports = BybitWebSocket;
