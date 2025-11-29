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
            // Tüm piyasa verilerini tek seferde çek
            const response = await axios.post(`${this.baseURL}/info`, {
                type: 'metaAndAssetCtxs'
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.data || !response.data[0] || !response.data[1]) {
                console.error('Hyperliquid invalid response format');
                return [];
            }

            const universe = response.data[0].universe;
            const contexts = response.data[1];

            const results = [];

            // İstenen semboller için veriyi bul
            symbols.forEach(symbol => {
                const coinIndex = universe.findIndex(u => u.name === symbol);

                if (coinIndex !== -1 && contexts[coinIndex]) {
                    const ctx = contexts[coinIndex];

                    // Funding rate: Hyperliquid saatlik veriyor.
                    // Diğer borsalarla (8 saatlik) kıyaslamak için 8 ile çarpıyoruz.
                    const hourlyFunding = parseFloat(ctx.funding);
                    const funding8h = hourlyFunding * 8 * 100; // Yüzdeye çevir ve 8 ile çarp

                    results.push({
                        symbol: symbol,
                        markPrice: parseFloat(ctx.markPx),
                        indexPrice: parseFloat(ctx.midPx || ctx.markPx),
                        bidPrice: parseFloat(ctx.bidPx || ctx.markPx),
                        askPrice: parseFloat(ctx.askPx || ctx.markPx),
                        lastFundingRate: funding8h,
                        nextFundingTime: new Date(Date.now() + 3600000), // Tahmini 1 saat sonra
                        exchange: 'Hyperliquid'
                    });
                } else {
                    console.warn(`Hyperliquid symbol not found: ${symbol}`);
                }
            });

            return results;
        } catch (error) {
            console.error('Hyperliquid multiple fetch error:', error.message);
            return [];
        }
    }

    // Tek bir coin için funding rate (Artık kullanılmıyor ama geriye uyumluluk için kalsın)
    async getFundingRate(coin) {
        return null;
    }

    // Tek bir coin için fiyat ve context bilgisi (Artık kullanılmıyor)
    async getAssetContext(coin) {
        return null;
    }
}

module.exports = HyperliquidService;
