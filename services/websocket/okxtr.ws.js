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
            bids: [], // Top 3 bids
            asks: [], // Top 3 asks
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
                    const str = data.toString();
                    if (str.includes('pong')) return; // Ignore pong
                    const message = JSON.parse(str);
                    this.handleMessage(message);
                } catch (error) {
                    // Ignore parse errors
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
            const tickerMsg = {
                op: 'subscribe',
                args: [{ channel: 'tickers', instId: 'USDT-TRY' }]
            };
            this.ws.send(JSON.stringify(tickerMsg));

            // Subscribe to USDT-TRY orderbook (5 levels)
            const orderbookMsg = {
                op: 'subscribe',
                args: [{ channel: 'books5', instId: 'USDT-TRY' }]
            };
            this.ws.send(JSON.stringify(orderbookMsg));

            console.log('[OKX TR] Subscribed to USDT-TRY ticker and orderbook');
        }
    }

    handleMessage(message) {
        if (!message.data || !message.arg) return;

        const instId = message.arg.instId;
        if (instId !== 'USDT-TRY') return;

        const channel = message.arg.channel;
        const ticker = message.data[0];

        if (channel === 'tickers' && ticker) {
            this.data.bid = parseFloat(ticker.bidPx) || this.data.bid;
            this.data.ask = parseFloat(ticker.askPx) || this.data.ask;
            this.data.last = parseFloat(ticker.last) || this.data.last;
            this.data.timestamp = Date.now();
        }

        if (channel === 'books5' && ticker) {
            // Bids: [[price, size, 0, numOrders], ...]
            if (ticker.bids && Array.isArray(ticker.bids)) {
                this.data.bids = ticker.bids.slice(0, 3).map(b => ({
                    price: parseFloat(b[0]),
                    amount: parseFloat(b[1])
                }));
                if (this.data.bids.length > 0) {
                    this.data.bid = this.data.bids[0].price;
                }
            }
            // Asks: [[price, size, 0, numOrders], ...]
            if (ticker.asks && Array.isArray(ticker.asks)) {
                this.data.asks = ticker.asks.slice(0, 3).map(a => ({
                    price: parseFloat(a[0]),
                    amount: parseFloat(a[1])
                }));
                if (this.data.asks.length > 0) {
                    this.data.ask = this.data.asks[0].price;
                }
            }
            this.data.timestamp = Date.now();
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
