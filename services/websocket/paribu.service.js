const axios = require('axios');

/**
 * Paribu REST API Service (No public WebSocket available)
 * Fetches ticker and orderbook data
 */
class ParibuService {
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
        console.log('[Paribu] Starting REST API polling...');
        // Initial fetch
        this.fetchData();
        // Poll every 3 seconds
        this.pollInterval = setInterval(() => this.fetchData(), 3000);
    }

    async fetchData() {
        try {
            // Fetch ticker
            const tickerResponse = await axios.get('https://www.paribu.com/ticker', {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RbitBot/1.0)'
                }
            });

            if (tickerResponse.data && tickerResponse.data.USDT_TL) {
                const ticker = tickerResponse.data.USDT_TL;
                this.data.bid = parseFloat(ticker.highestBid) || 0;
                this.data.ask = parseFloat(ticker.lowestAsk) || 0;
                this.data.last = parseFloat(ticker.last) || 0;
                this.data.timestamp = Date.now();
            }

            // Try to fetch orderbook
            try {
                const orderbookResponse = await axios.get('https://www.paribu.com/orderbook?market=usdt_tl', {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; RbitBot/1.0)'
                    }
                });

                if (orderbookResponse.data) {
                    // Bids (buy orders) - high to low
                    if (orderbookResponse.data.bids && Array.isArray(orderbookResponse.data.bids)) {
                        this.data.bids = orderbookResponse.data.bids.slice(0, 3).map(b => ({
                            price: parseFloat(b[0]),
                            amount: parseFloat(b[1])
                        }));
                    }
                    // Asks (sell orders) - low to high
                    if (orderbookResponse.data.asks && Array.isArray(orderbookResponse.data.asks)) {
                        this.data.asks = orderbookResponse.data.asks.slice(0, 3).map(a => ({
                            price: parseFloat(a[0]),
                            amount: parseFloat(a[1])
                        }));
                    }
                }
            } catch (obError) {
                // Orderbook fetch failed, continue with ticker data
            }

        } catch (error) {
            // Silent fail - will retry on next interval
            if (this.data.timestamp === 0) {
                console.warn('[Paribu] Failed to fetch data:', error.message);
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

module.exports = ParibuService;
