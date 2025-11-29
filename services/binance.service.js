const axios = require('axios');
const crypto = require('crypto');

class BinanceService {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseURL = 'https://fapi.binance.com';
  }

  // HMAC SHA256 signature oluşturma
  createSignature(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  // Güncel funding rate ve fiyat bilgisi
  async getPremiumIndex(symbol) {
    try {
      const endpoint = '/fapi/v1/premiumIndex';
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params: { symbol }
      });
      return response.data;
    } catch (error) {
      console.error(`Binance error for ${symbol}:`, error.message);
      return null;
    }
  }

  // Birden fazla coin için funding rate ve fiyat
  async getMultiplePremiumIndex(symbols) {
    try {
      const promises = symbols.map(symbol => this.getPremiumIndex(symbol));
      const results = await Promise.all(promises);
      
      return results
        .filter(result => result !== null)
        .map(data => ({
          symbol: data.symbol,
          markPrice: parseFloat(data.markPrice),
          indexPrice: parseFloat(data.indexPrice),
          lastFundingRate: parseFloat(data.lastFundingRate) * 100, // Yüzde olarak
          nextFundingTime: new Date(data.nextFundingTime),
          exchange: 'Binance'
        }));
    } catch (error) {
      console.error('Binance multiple fetch error:', error.message);
      return [];
    }
  }

  // Tüm perpetual futures sembollerini getir
  async getAllPerpetualSymbols() {
    try {
      const endpoint = '/fapi/v1/exchangeInfo';
      const response = await axios.get(`${this.baseURL}${endpoint}`);
      
      return response.data.symbols
        .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
        .map(s => s.symbol);
    } catch (error) {
      console.error('Binance symbols fetch error:', error.message);
      return [];
    }
  }
}

module.exports = BinanceService;
