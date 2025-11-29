const axios = require('axios');
const crypto = require('crypto');

class OKXService {
    constructor(apiKey, apiSecret, passphrase) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.passphrase = passphrase;
        this.baseURL = 'https://www.okx.com';
    }

    // OKX signature oluşturma
    createSignature(timestamp, method, path, body = '') {
        const message = timestamp + method + path + body;
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(message)
            .digest('base64');
    }

    // Headers oluşturma
    getHeaders(method, path, body = '') {
        const timestamp = new Date().toISOString();
        const signature = this.createSignature(timestamp, method, path, body);

        return {
            'OK-ACCESS-KEY': this.apiKey,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.passphrase,
            'Content-Type': 'application/json'
        };
    }

    // Güncel funding rate
    async getFundingRate(instId) {
        try {
            const path = '/api/v5/public/funding-rate';
            const response = await axios.get(`${this.baseURL}${path}`, {
                params: { instId }
            });

            if (response.data.code === '0' && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) {
            console.error(`OKX funding rate error for ${instId}:`, error.message);
            return null;
        }
    }

    // Mark price ve index price
    async getMarkPrice(instId) {
        try {
            const path = '/api/v5/public/mark-price';
            const response = await axios.get(`${this.baseURL}${path}`, {
                params: { instType: 'SWAP', instId }
            });

            if (response.data.code === '0' && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) {
            console.error(`OKX mark price error for ${instId}:`, error.message);
            return null;
        }
    }

    // Birden fazla coin için funding rate ve fiyat
    async getMultipleFundingData(instIds) {
        try {
            const promises = instIds.map(async (instId) => {
                const [fundingData, priceData, tickerData] = await Promise.all([
                    this.getFundingRate(instId),
                    this.getMarkPrice(instId),
                    this.getTicker(instId)
                ]);

                if (!fundingData || !priceData) return null;

                return {
                    symbol: instId,
                    markPrice: parseFloat(priceData.markPx),
                    indexPrice: parseFloat(priceData.idxPx),
                    bidPrice: tickerData ? parseFloat(tickerData.bidPx) : parseFloat(priceData.markPx),
                    askPrice: tickerData ? parseFloat(tickerData.askPx) : parseFloat(priceData.markPx),
                    lastFundingRate: parseFloat(fundingData.fundingRate) * 100, // Yüzde olarak
                    nextFundingTime: new Date(parseInt(fundingData.nextFundingTime)),
                    exchange: 'OKX'
                };
            });

            const results = await Promise.all(promises);
            return results.filter(result => result !== null);
        } catch (error) {
            console.error('OKX multiple fetch error:', error.message);
            return [];
        }
    }

    // Ticker (Bid/Ask) fiyatları
    async getTicker(instId) {
        try {
            const path = '/api/v5/market/ticker';
            const response = await axios.get(`${this.baseURL}${path}`, {
                params: { instId }
            });

            if (response.data.code === '0' && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) {
            console.error(`OKX ticker error for ${instId}:`, error.message);
            return null;
        }
    }

    // Tüm perpetual swap sembollerini getir
    async getAllSwapSymbols() {
        try {
            const path = '/api/v5/public/instruments';
            const response = await axios.get(`${this.baseURL}${path}`, {
                params: { instType: 'SWAP' }
            });

            if (response.data.code === '0') {
                return response.data.data
                    .filter(s => s.state === 'live')
                    .map(s => s.instId);
            }
            return [];
        } catch (error) {
            console.error('OKX symbols fetch error:', error.message);
            return [];
        }
    }
}

module.exports = OKXService;
