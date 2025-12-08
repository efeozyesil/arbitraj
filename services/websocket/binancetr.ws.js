const axios = require('axios');

/**
 * Binance TR REST API Service
 * Fetches ticker and orderbook data
 */
class BinanceTRService {
    constructor() {
        this.data = {
            bid: 0,
            ask: 0,
            last: 0,
            bids: [], // Top 3 bids
            asks: [], // Top 3 asks
            timestamp: 0
        };
        this.pollInterval = null;
    }

    connect() {
        console.log('[Binance TR] Starting REST API polling...');
        // Initial fetch
        this.fetchData();
        // Poll every 2 seconds
        this.pollInterval = setInterval(() => this.fetchData(), 2000);
    }

    async fetchData() {
        try {
            // Fetch ticker
            const tickerResponse = await axios.get('https://api.binance.me/api/v3/ticker/bookTicker', {
                params: { symbol: 'USDTTRY' },
                timeout: 5000
            });

            if (tickerResponse.data && tickerResponse.data.bidPrice) {
                this.data.bid = parseFloat(tickerResponse.data.bidPrice) || 0;
                this.data.ask = parseFloat(tickerResponse.data.askPrice) || 0;
                this.data.last = (this.data.bid + this.data.ask) / 2;
                this.data.timestamp = Date.now();
            }

            // Fetch orderbook depth
            const depthResponse = await axios.get('https://api.binance.me/api/v3/depth', {
                params: { symbol: 'USDTTRY', limit: 5 },
                timeout: 5000
            });

            if (depthResponse.data) {
                // Bids: [[price, quantity], ...] - sorted high to low
                if (depthResponse.data.bids && Array.isArray(depthResponse.data.bids)) {
                    this.data.bids = depthResponse.data.bids.slice(0, 3).map(b => ({
                        price: parseFloat(b[0]),
                        amount: parseFloat(b[1])
                    }));
                    if (this.data.bids.length > 0) {
                        this.data.bid = this.data.bids[0].price;
                    }
                }
                // Asks: [[price, quantity], ...] - sorted low to high
                if (depthResponse.data.asks && Array.isArray(depthResponse.data.asks)) {
                    this.data.asks = depthResponse.data.asks.slice(0, 3).map(a => ({
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
            // Silent fail - will retry on next interval
            if (this.data.timestamp === 0) {
                console.warn('[Binance TR] Failed to fetch data:', error.message);
            }
        }
    }

    getData() {
        return this.data;
    }

    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

module.exports = BinanceTRService;
