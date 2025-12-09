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
            // Binance fapi exchangeInfo contains fundingIntervalHours for some symbols
            console.log('Fetching Binance metadata...');
            const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
            if (response.data && response.data.symbols) {
                response.data.symbols.forEach(sym => {
                    if (sym.contractType === 'PERPETUAL') {
                        // fundingIntervalHours is usually present
                        const interval = sym.fundingIntervalHours || 8;
                        this.intervals.binance[sym.symbol] = interval;
                    }
                });
                console.log(`✅ Loaded ${Object.keys(this.intervals.binance).length} Binance funding intervals.`);
            }
        } catch (e) {
            console.error('Binance metadata fetch error:', e.message);
        }
    }

    async fetchOkxMetadata() {
        try {
            // OKX: Most USDT perps are 8h, some are variable
            // OKX doesn't directly expose interval in instruments endpoint
            // We'll use a default of 8h for all OKX pairs
            console.log('Setting OKX default funding interval (8h)...');
            // OKX generally uses 8h for most pairs
            // If we need specific intervals, we'd need to check funding-rate endpoint per symbol
            // For now, return null and let estimator work from nextFundingTime
            console.log('✅ OKX using dynamic interval estimation from nextFundingTime');
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
