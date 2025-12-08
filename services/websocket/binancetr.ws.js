const axios = require('axios');

/**
 * Binance TR REST API Service
 * Uses REST polling since WebSocket is unreliable
 * API: https://api.binance.me/api/v3/ticker/bookTicker
 */
class BinanceTRService {
    constructor() {
        this.data = {
            bid: 0,
            ask: 0,
            last: 0,
            timestamp: 0
        };
        this.pollInterval = null;
    }

    connect() {
        console.log('[Binance TR] Starting REST API polling...');
        // Initial fetch
        this.fetchTicker();
        // Poll every 2 seconds
        this.pollInterval = setInterval(() => this.fetchTicker(), 2000);
    }

    async fetchTicker() {
        try {
            // Try the main Binance API with TRY pair
            const response = await axios.get('https://api.binance.me/api/v3/ticker/bookTicker', {
                params: { symbol: 'USDTTRY' },
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RbitBot/1.0)'
                }
            });

            if (response.data && response.data.bidPrice) {
                this.data = {
                    bid: parseFloat(response.data.bidPrice) || 0,
                    ask: parseFloat(response.data.askPrice) || 0,
                    last: (parseFloat(response.data.bidPrice) + parseFloat(response.data.askPrice)) / 2,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            // Try alternative endpoint
            try {
                const altResponse = await axios.get('https://www.binance.tr/gateway-api/v2/public/marketdata/products', {
                    timeout: 5000
                });

                if (altResponse.data && altResponse.data.data) {
                    const usdtTry = altResponse.data.data.find(p => p.s === 'USDTTRY' || p.symbol === 'USDTTRY');
                    if (usdtTry) {
                        this.data = {
                            bid: parseFloat(usdtTry.b || usdtTry.bidPrice) || 0,
                            ask: parseFloat(usdtTry.a || usdtTry.askPrice) || 0,
                            last: parseFloat(usdtTry.c || usdtTry.lastPrice) || 0,
                            timestamp: Date.now()
                        };
                    }
                }
            } catch (altError) {
                // Silent fail - will retry on next interval
                if (this.data.timestamp === 0) {
                    console.warn('[Binance TR] Failed to fetch ticker:', error.message);
                }
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
