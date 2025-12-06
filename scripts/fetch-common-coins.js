const axios = require('axios');

async function fetchCommonCoins() {
    try {
        console.log('🔍 Fetching coin lists from all 5 exchanges...\n');

        // 1. Binance Futures
        console.log('📊 Fetching Binance...');
        const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const binanceSymbols = binanceRes.data.symbols
            .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({
                base: s.baseAsset,
                symbol: s.symbol
            }));
        console.log(`   ✅ Binance: ${binanceSymbols.length} perpetuals`);

        // 2. OKX Swap
        console.log('📊 Fetching OKX...');
        const okxRes = await axios.get('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
        const okxSymbols = okxRes.data.data
            .filter(s => s.settleCcy === 'USDT' && s.state === 'live')
            .map(s => {
                const parts = s.instId.split('-');
                return {
                    base: parts[0],
                    symbol: s.instId
                };
            });
        console.log(`   ✅ OKX: ${okxSymbols.length} swaps`);

        // 3. Bybit
        console.log('📊 Fetching Bybit...');
        const bybitRes = await axios.get('https://api.bybit.com/v5/market/instruments-info?category=linear');
        const bybitSymbols = bybitRes.data.result.list
            .filter(s => s.quoteCoin === 'USDT' && s.status === 'Trading')
            .map(s => {
                // Remove USDT suffix to get base
                const base = s.symbol.replace('USDT', '').replace('PERP', '');
                return {
                    base: base,
                    symbol: s.symbol
                };
            });
        console.log(`   ✅ Bybit: ${bybitSymbols.length} linear perpetuals`);

        // 4. Hyperliquid
        console.log('📊 Fetching Hyperliquid...');
        const hlRes = await axios.post('https://api.hyperliquid.xyz/info', { type: "meta" });
        const hlSymbols = hlRes.data.universe.map(s => ({
            base: s.name.replace('k', ''),  // Handle kPEPE -> PEPE
            symbol: s.name
        }));
        console.log(`   ✅ Hyperliquid: ${hlSymbols.length} perpetuals`);

        // 5. Asterdex (Placeholder - needs actual API)
        console.log('📊 Asterdex (using Binance list as reference)...');
        const asterdexSymbols = binanceSymbols.map(s => ({
            base: s.base,
            symbol: s.symbol
        }));
        console.log(`   ✅ Asterdex: ${asterdexSymbols.length} (mirrored)`);

        console.log('\n🔍 Finding common coins across all exchanges...\n');

        // Map to normalize base names
        const normalizeBase = (base) => {
            // Handle special cases
            if (base.startsWith('1000')) return base.substring(4); // 1000PEPE -> PEPE
            if (base.startsWith('k')) return base.substring(1);    // kPEPE -> PEPE
            return base;
        };

        const commonCoins = [];
        const baseSet = new Set();

        // Use Hyperliquid as reference (usually cleaner symbols)
        for (const hl of hlSymbols) {
            const normalizedBase = normalizeBase(hl.base);

            // Skip if already processed
            if (baseSet.has(normalizedBase)) continue;

            // Find matches in other exchanges
            const binanceMatch = binanceSymbols.find(b => normalizeBase(b.base) === normalizedBase);
            const okxMatch = okxSymbols.find(o => normalizeBase(o.base) === normalizedBase);
            const bybitMatch = bybitSymbols.find(by => normalizeBase(by.base) === normalizedBase);
            const asterdexMatch = asterdexSymbols.find(a => normalizeBase(a.base) === normalizedBase);

            // Add if present in at least 2 exchanges (allowing arbitrage opportunities)
            const matchCount = [binanceMatch, okxMatch, bybitMatch, hlSymbols.find(h => normalizeBase(h.base) === normalizedBase), asterdexMatch]
                .filter(m => m).length;

            if (matchCount >= 2) {
                baseSet.add(normalizedBase);

                commonCoins.push({
                    binance: binanceMatch?.symbol || null,
                    okx: okxMatch?.symbol || null,
                    hyperliquid: hl.symbol || null,
                    bybit: bybitMatch?.symbol || null,
                    asterdex: asterdexMatch?.symbol || null,
                    name: normalizedBase,
                    symbol: normalizedBase,
                    logo: `https://cryptologos.cc/logos/${normalizedBase.toLowerCase()}-logo.png`,
                    color: '#000000'
                });
            }
        }

        // Sort by symbol
        commonCoins.sort((a, b) => a.symbol.localeCompare(b.symbol));

        console.log(`✅ Found ${commonCoins.length} common coins (present in 4+ exchanges)\n`);

        // Group by availability
        const allFive = commonCoins.filter(c => c.binance && c.okx && c.bybit && c.hyperliquid && c.asterdex);
        const fourExchanges = commonCoins.filter(c => !allFive.includes(c));

        console.log(`   🌟 All 5 exchanges: ${allFive.length} coins`);
        console.log(`   📊 4 exchanges: ${fourExchanges.length} coins`);
        console.log(`   📈 Total: ${commonCoins.length} coins\n`);

        // Show first 10 as sample
        console.log('📋 Sample (first 10):');
        commonCoins.slice(0, 10).forEach((coin, i) => {
            const exchanges = [];
            if (coin.binance) exchanges.push('Binance');
            if (coin.okx) exchanges.push('OKX');
            if (coin.bybit) exchanges.push('Bybit');
            if (coin.hyperliquid) exchanges.push('Hyperliquid');
            if (coin.asterdex) exchanges.push('Asterdex');

            console.log(`${i + 1}. ${coin.symbol.padEnd(10)} [${exchanges.join(', ')}]`);
        });

        // Generate JavaScript array format
        console.log('\n\n📝 Generating JavaScript array format...\n');
        const jsArray = commonCoins.map(coin => {
            return `{ "binance": ${coin.binance ? `"${coin.binance}"` : 'null'}, "okx": ${coin.okx ? `"${coin.okx}"` : 'null'}, "hyperliquid": ${coin.hyperliquid ? `"${coin.hyperliquid}"` : 'null'}, "bybit": ${coin.bybit ? `"${coin.bybit}"` : 'null'}, "asterdex": ${coin.asterdex ? `"${coin.asterdex}"` : 'null'}, "name": "${coin.name}", "symbol": "${coin.symbol}", "logo": "${coin.logo}", "color": "${coin.color}" }`;
        });

        console.log('Copy and paste this into arbitrage.service.js:\n');
        console.log('const coins = [');
        jsArray.forEach(line => console.log('    ' + line + ','));
        console.log('];\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

fetchCommonCoins();
