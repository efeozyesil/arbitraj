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
        try {
            const msg = JSON.parse(data.toString());

            if (msg.channel === 'allMids') {
                // DÜZELTME: Veri msg.data.mids içinde geliyor
                const mids = msg.data.mids || msg.data;

                // Debug log for first data
                if (!this.hasReceivedData) {
                    console.log('[Hyperliquid] Data structure fixed. Sample symbols:', Object.keys(mids).slice(0, 5));
                    this.hasReceivedData = true;
                }

                Object.keys(mids).forEach(symbol => {
                    const price = parseFloat(mids[symbol]);

                    // MATIC / POL dönüşümü
                    // Eğer sembol POL ise ve biz MATIC arıyorsak, veya tam tersi
                    let normalizedSymbol = symbol;
                    if (symbol === 'POL') normalizedSymbol = 'MATIC'; // Sistemde MATIC olarak kullanıyoruz
                    if (symbol === 'MATIC') normalizedSymbol = 'MATIC';

                    const fundingData = this.fundingRates[symbol] || { rate: 0, time: 0 };

                    // Hyperliquid funding is hourly - DO NOT multiply by 8
                    // Keep as-is for accurate hourly rates
                    const fundingRate = fundingData.rate;

                    // Calculate next funding time (top of next hour)
                    const now = Date.now();
                    const nextHour = new Date(now);
                    nextHour.setMinutes(0, 0, 0);
                    nextHour.setHours(nextHour.getHours() + 1);

                    this.data[normalizedSymbol] = {
                        symbol: normalizedSymbol,
                        markPrice: price, // Using mid price as proxy for mark price
                        fundingRate: fundingRate,
                        fundingInterval: 1, // Hyperliquid funding is every 1 hour
                        nextFundingTime: nextHour.getTime(),
                        timestamp: Date.now()
                    };

                    // POL geldiyse MATIC olarak da kaydet (yedek)
                    if (symbol === 'POL') {
                        this.data['MATIC'] = this.data[normalizedSymbol];
                    }
                });
            }
        } catch (error) {
            console.error('[Hyperliquid] Message parsing error:', error.message);
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
