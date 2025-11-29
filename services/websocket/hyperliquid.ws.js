const BaseWebSocket = require('./base.ws');
const axios = require('axios');

class HyperliquidWebSocket extends BaseWebSocket {
    constructor() {
        super('Hyperliquid', 'wss://api.hyperliquid.xyz/ws');
        this.fundingRates = {};
        this.fundingInterval = null;
    }

    onOpen() {
        // Subscribe to all prices
        this.ws.send(JSON.stringify({
            method: "subscribe",
            subscription: { type: "allMids" }
        }));

        // Fetch initial funding rates
        this.updateFundingRates();

        // Update funding rates every 1 minute (since they change hourly)
        this.fundingInterval = setInterval(() => this.updateFundingRates(), 60000);
    }

    cleanup() {
        super.cleanup();
        if (this.fundingInterval) {
            clearInterval(this.fundingInterval);
            this.fundingInterval = null;
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ method: "ping" }));
            }
        }, 50000);
    }

    onMessage(data) {
        const msg = JSON.parse(data.toString());

        if (msg.channel === 'allMids') {
            const mids = msg.data;

            Object.keys(mids).forEach(symbol => {
                const price = parseFloat(mids[symbol]);
                const fundingData = this.fundingRates[symbol] || { rate: 0, time: 0 };

                // Hyperliquid funding is hourly, convert to 8h equivalent for comparison
                const funding8h = fundingData.rate * 8;

                this.data[symbol] = {
                    symbol: symbol,
                    markPrice: price, // Using mid price as proxy for mark price
                    fundingRate: funding8h,
                    nextFundingTime: fundingData.time + 3600000,
                    timestamp: Date.now()
                };
            });
        }
    }

    async updateFundingRates() {
        try {
            const response = await axios.post('https://api.hyperliquid.xyz/info', {
                type: 'metaAndAssetCtxs'
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data && response.data[0] && response.data[1]) {
                const universe = response.data[0].universe;
                const contexts = response.data[1];

                universe.forEach((u, index) => {
                    if (contexts[index]) {
                        const ctx = contexts[index];
                        this.fundingRates[u.name] = {
                            rate: parseFloat(ctx.funding) * 100, // Percentage
                            time: Date.now() // Approximation
                        };
                    }
                });
                console.log('[Hyperliquid] Funding rates updated');
            }
        } catch (error) {
            console.error('[Hyperliquid] Failed to update funding rates:', error.message);
        }
    }
}

module.exports = HyperliquidWebSocket;
