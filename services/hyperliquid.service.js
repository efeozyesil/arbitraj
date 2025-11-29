const axios = require('axios');

class HyperliquidService {
    constructor() {
        this.baseURL = 'https://api.hyperliquid.xyz';
    }

    // Meta bilgisi (tüm perpetual'ların listesi)
    async getPerpetualsMetadata() {
        try {
            const response = await axios.post(`${this.baseURL}/info`, {
                type: 'meta'
            });

            if (response.data && response.data.universe) {
                return response.data.universe;
            }
            return [];
        } catch (error) {
            console.error('Hyperliquid meta error:', error.message);
            return [];
        }
    }

    // Tüm perpetual'ların güncel durumu (mark price, funding rate, etc.)
    async getAllMids() {
        try {
            const response = await axios.post(`${this.baseURL}/info`, {
                type: 'allMids'
            });
            return response.data || {};
        } catch (error) {
            console.error('Hyperliquid allMids error:', error.message);
            return {};
        }
    }

    // Birden fazla coin için funding rate ve fiyat
    async getMultipleFundingData(symbols) {
        try {
            // symbols: ['BTC', 'ETH', 'SOL', ...]
            const promises = symbols.map(async (symbol) => {
                const [fundingData, priceData] = await Promise.all([
                    this.getFundingRate(symbol),
                    this.getAssetContext(symbol)
                ]);

                if (!fundingData || !priceData) return null;

                return {
                    symbol: symbol,
                    markPrice: parseFloat(priceData.markPx),
                    indexPrice: parseFloat(priceData.midPx || priceData.markPx), // Hyperliquid uses midPx
                    bidPrice: parseFloat(priceData.bidPx || priceData.markPx),
                    askPrice: parseFloat(priceData.askPx || priceData.markPx),
                    lastFundingRate: parseFloat(fundingData.funding) * 100, // Yüzde olarak
                    nextFundingTime: new Date(fundingData.time + 3600000), // 1 saat sonra (Hyperliquid saatlik)
                    exchange: 'Hyperliquid'
                };
            });

            const results = await Promise.all(promises);
            return results.filter(result => result !== null);
        } catch (error) {
            console.error('Hyperliquid multiple fetch error:', error.message);
            return [];
        }
    }

    // Tek bir coin için funding rate  
    async getFundingRate(coin) {
        try {
            // Son 1 saatlik funding history al
            const endTime = Date.now();
            const startTime = endTime - 3600000; // 1 saat önce

            const response = await axios.post(`${this.baseURL}/info`, {
                type: 'fundingHistory',
                coin: coin,
                startTime: startTime,
                endTime: endTime
            });

            if (response.data && response.data.length > 0) {
                // En son funding rate'i al
                return response.data[response.data.length - 1];
            }
            return null;
        } catch (error) {
            console.error(`Hyperliquid funding rate error for ${coin}:`, error.message);
            return null;
        }
    }

    // Tek bir coin için fiyat ve context bilgisi
    async getAssetContext(coin) {
        try {
            const response = await axios.post(`${this.baseURL}/info`, {
                type: 'metaAndAssetCtxs'
            });

            if (response.data && response.data[0] && response.data[0].universe) {
                // Coin'in index'ini bul
                const coinIndex = response.data[0].universe.findIndex(u => u.name === coin);

                if (coinIndex !== -1 && response.data[1] && response.data[1][coinIndex]) {
                    const ctx = response.data[1][coinIndex];
                    return {
                        markPx: ctx.markPx,
                        midPx: ctx.midPx,
                        bidPx: ctx.bidPx,
                        askPx: ctx.askPx,
                        openInterest: ctx.openInterest,
                        funding: ctx.funding
                    };
                }
            }
            return null;
        } catch (error) {
            console.error(`Hyperliquid asset context error for ${coin}:`, error.message);
            return null;
        }
    }
}

module.exports = HyperliquidService;
