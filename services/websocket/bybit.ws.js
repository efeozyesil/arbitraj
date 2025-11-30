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

                    // Handle ticker updates
                    if (message.topic && message.topic.startsWith('tickers.')) {
                        const tickerData = message.data;
                        const symbol = tickerData.symbol;

                        this.data.set(symbol, {
                            symbol: symbol,
                            markPrice: parseFloat(tickerData.markPrice),
                            fundingRate: parseFloat(tickerData.fundingRate) * 100, // Convert to percentage
                            nextFundingTime: tickerData.nextFundingTime
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
            // Subscribe to tickers for all symbols
            const subscribeMessage = {
                op: 'subscribe',
                args: this.symbols.map(symbol => `tickers.${symbol}`)
            };

            this.ws.send(JSON.stringify(subscribeMessage));
            console.log(`[Bybit] Subscribed to ${this.symbols.length} symbols`);
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
