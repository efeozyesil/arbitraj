const axios = require('axios');

/**
 * Paribu REST API Service (No public WebSocket available)
 * Fallback to ticker polling
 */
class ParibuService {
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
        console.log('[Paribu] Starting REST API polling...');
        // Initial fetch
        this.fetchTicker();
        // Poll every 5 seconds
        this.pollInterval = setInterval(() => this.fetchTicker(), 5000);
    }

    async fetchTicker() {
        try {
            // Paribu public ticker endpoint
            const response = await axios.get('https://www.paribu.com/ticker', {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RbitBot/1.0)'
                }
            });

            if (response.data && response.data.USDT_TL) {
                const ticker = response.data.USDT_TL;
                this.data = {
                    bid: parseFloat(ticker.highestBid) || 0,
                    ask: parseFloat(ticker.lowestAsk) || 0,
                    last: parseFloat(ticker.last) || 0,
                    volume: parseFloat(ticker.volume) || 0,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            // Silent fail - will retry on next interval
            if (this.data.timestamp === 0) {
                console.warn('[Paribu] Failed to fetch ticker:', error.message);
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
