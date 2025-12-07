const axios = require('axios');

class MetadataService {
    constructor() {
        // Map<Exchange, Map<Symbol, Interval>>
        // Example: intervals['okx']['BTC-USDT-SWAP'] = 8
        this.intervals = {
            binance: {},
            okx: {},
            bybit: {},
            hyperliquid: {}, // Usually 1h fixed
            asterdex: {}
        };
    }

    async initialize() {
        console.log('Fetching exchange metadata (funding intervals)...');
        await Promise.all([
            this.fetchBinanceMetadata(),
            this.fetchOkxMetadata(),
            this.fetchBybitMetadata()
            // Hyperliquid is always 1h, Asterdex copy Binance usually
        ]);
        console.log('Metadata fetch complete.');
    }

    async fetchBinanceMetadata() {
        try {
            // Binance usually 8h, but let's check info if possible. 
            // Binance fapi/v1/exchangeInfo does not explicitly return funding interval in hours easily, 
            // but standard is 8h. Some pairs are 4h.
            // For now, we assume 8h default for Binance unless we find deeper info.
            // We can leave it empty and let fallback to 8 work, or implementation specific logic.
        } catch (e) {
            console.error('Binance metadata fetch error:', e.message);
        }
    }

    async fetchOkxMetadata() {
        try {
            // OKX Public Instruments
            const response = await axios.get('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
            if (response.data && response.data.data) {
                response.data.data.forEach(inst => {
                    // OKX does not explicitly send funding interval in instruments endpoint often.
                    // However, we can map symbols. 
                    // Critical: OKX funding interval can be variable.
                });
            }
        } catch (e) {
            console.error('OKX metadata fetch error:', e.message);
        }
    }

    async fetchBybitMetadata() {
        try {
            // Bybit V5 Instruments Info
            // category=linear for USDT perps
            console.log('Fetching Bybit metadata...');
            const response = await axios.get('https://api.bybit.com/v5/market/instruments-info?category=linear');
            if (response.data && response.data.result && response.data.result.list) {
                response.data.result.list.forEach(inst => {
                    // Bybit returns fundingInterval in minutes (e.g. 480 for 8h)
                    const symbol = inst.symbol;
                    const intervalHours = parseInt(inst.fundingInterval) / 60;
                    this.intervals.bybit[symbol] = intervalHours;
                });
                console.log(`✅ Loaded ${Object.keys(this.intervals.bybit).length} Bybit funding intervals.`);
            }
        } catch (e) {
            console.error('Bybit metadata fetch error:', e.message);
        }
    }

    getInterval(exchange, symbol) {
        // Normalize exchange name
        const ex = exchange.toLowerCase();

        if (ex === 'hyperliquid') return 1; // Always 1h
        if (ex === 'asterdex') return 8; // Assumed 8h

        // Normalize symbol (remove -SWAP, etc if needed)
        // Bybit API uses BTCUSDT. Our app uses BTCUSDT. Match should be direct.
        // OKX API uses BTC-USDT-SWAP.

        // Debug first request for this exchange
        // if (Math.random() < 0.001) console.log(`Checking interval for ${ex} ${symbol}`);

        if (this.intervals[ex]) {
            // Direct match
            if (this.intervals[ex][symbol]) return this.intervals[ex][symbol];

            // Try normalizing OKX symbol (if stored as BTC-USDT-SWAP but requested as BTCUSDT or vice versa)
            // Our system usually stores OKX symbols as BTC-USDT-SWAP.
        }

        // OKX logic: If nextFundingTime is provided externally we might use that, 
        // but here we just return null to let calculator use fallback/estimate
        // OR we can default to 8 here.
        return null;
    }
}

module.exports = new MetadataService();
