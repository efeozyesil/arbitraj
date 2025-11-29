const axios = require('axios');

async function fetchCommonCoins() {
    try {
        console.log('Fetching tickers...');

        // 1. Binance Futures
        const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const binanceSymbols = binanceRes.data.symbols
            .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({
                base: s.baseAsset,
                symbol: s.symbol,
                original: s
            }));

        // 2. OKX Swap
        const okxRes = await axios.get('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
        const okxSymbols = okxRes.data.data
            .filter(s => s.settleCcy === 'USDT' && s.state === 'live')
            .map(s => {
                // instId: BTC-USDT-SWAP -> base: BTC
                const parts = s.instId.split('-');
                return {
                    base: parts[0],
                    symbol: s.instId,
                    original: s
                };
            });

        // 3. Hyperliquid
        const hlRes = await axios.post('https://api.hyperliquid.xyz/info', { type: "meta" });
        const hlSymbols = hlRes.data.universe.map(s => ({
            base: s.name, // e.g. BTC
            symbol: s.name // e.g. BTC
        }));

        console.log('Sample Binance:', binanceSymbols[0]);
        console.log('Sample OKX:', okxSymbols[0]);
        console.log('Sample Hyperliquid:', hlSymbols[0]);

        console.log(`Binance: ${binanceSymbols.length}, OKX: ${okxSymbols.length}, Hyperliquid: ${hlSymbols.length}`);

        // Intersection
        const commonCoins = [];

        // Base asset üzerinden eşleştirme (BTC, ETH, SOL...)
        // Hyperliquid base asset isimleri genellikle standarttır (BTC, ETH).
        // Binance: BTC, ETH.
        // OKX: BTC, ETH.

        // Hyperliquid listesini referans alalım (en az coin orada olabilir veya en temiz liste)
        for (const hl of hlSymbols) {
            const base = hl.base;

            // Binance check
            // Binance base asset bazen farklı olabilir (örn: 1000SHIB vs SHIB). 
            // Basit eşleştirme yapalım.
            const binanceMatch = binanceSymbols.find(b => b.base === base);

            // OKX check
            const okxMatch = okxSymbols.find(o => o.base === base);

            if (binanceMatch && okxMatch) {
                commonCoins.push({
                    binance: binanceMatch.symbol,
                    okx: okxMatch.symbol,
                    hyperliquid: hl.symbol,
                    name: base,
                    symbol: base,
                    logo: `https://cryptologos.cc/logos/${base.toLowerCase()}-${base.toLowerCase()}-logo.png`,
                    color: '#000000' // Default color
                });
            }
        }

        console.log(`Found ${commonCoins.length} common coins.`);
        console.log(JSON.stringify(commonCoins, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

fetchCommonCoins();
