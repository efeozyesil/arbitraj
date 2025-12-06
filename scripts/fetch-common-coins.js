const axios = require('axios');
const fs = require('fs');

async function fetchAllCoins() {
    console.log('🔍 Step 1: Fetching ALL coins from each exchange...\n');

    const allExchangeCoins = {};

    try {
        // 1. BINANCE
        console.log('📊 Fetching Binance Futures...');
        const binanceRes = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
        allExchangeCoins.binance = binanceRes.data.symbols
            .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({
                exchange: 'binance',
                symbol: s.symbol,
                base: s.baseAsset,
                quote: s.quoteAsset
            }));
        console.log(`   ✅ Binance: ${allExchangeCoins.binance.length} perpetuals`);

        // 2. OKX
        console.log('📊 Fetching OKX Swap...');
        const okxRes = await axios.get('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
        allExchangeCoins.okx = okxRes.data.data
            .filter(s => s.settleCcy === 'USDT' && s.state === 'live')
            .map(s => {
                const parts = s.instId.split('-');
                return {
                    exchange: 'okx',
                    symbol: s.instId,
                    base: parts[0],
                    quote: parts[1]
                };
            });
        console.log(`   ✅ OKX: ${allExchangeCoins.okx.length} swaps`);

        // 3. BYBIT
        console.log('📊 Fetching Bybit Linear...');
        const bybitRes = await axios.get('https://api.bybit.com/v5/market/instruments-info?category=linear');
        allExchangeCoins.bybit = bybitRes.data.result.list
            .filter(s => s.quoteCoin === 'USDT' && s.status === 'Trading')
            .map(s => {
                const base = s.symbol.replace('USDT', '').replace('PERP', '');
                return {
                    exchange: 'bybit',
                    symbol: s.symbol,
                    base: base,
                    quote: 'USDT'
                };
            });
        console.log(`   ✅ Bybit: ${allExchangeCoins.bybit.length} linear perpetuals`);

        // 4. HYPERLIQUID
        console.log('📊 Fetching Hyperliquid...');
        const hlRes = await axios.post('https://api.hyperliquid.xyz/info', { type: "meta" });
        allExchangeCoins.hyperliquid = hlRes.data.universe.map(s => ({
            exchange: 'hyperliquid',
            symbol: s.name,
            base: s.name,
            quote: 'USDT'
        }));
        console.log(`   ✅ Hyperliquid: ${allExchangeCoins.hyperliquid.length} perpetuals`);

        // 5. ASTERDEX - Need real API
        console.log('📊 Asterdex - Checking if API available...');
        try {
            // Try common endpoints
            const asterdexRes = await axios.get('https://api.asterdex.com/v1/instruments', { timeout: 5000 }).catch(() => null);
            if (asterdexRes && asterdexRes.data) {
                allExchangeCoins.asterdex = asterdexRes.data.map(s => ({
                    exchange: 'asterdex',
                    symbol: s.symbol,
                    base: s.baseAsset || s.symbol.replace('USDT', ''),
                    quote: 'USDT'
                }));
                console.log(`   ✅ Asterdex: ${allExchangeCoins.asterdex.length} (from API)`);
            } else {
                throw new Error('API not available');
            }
        } catch (err) {
            console.log(`   ⚠️  Asterdex: API not found, using Binance mirror for now`);
            allExchangeCoins.asterdex = allExchangeCoins.binance.map(s => ({
                ...s,
                exchange: 'asterdex'
            }));
            console.log(`   📋 Asterdex: ${allExchangeCoins.asterdex.length} (mirrored from Binance)`);
        }

        // Save raw data
        console.log('\n� Saving raw data to files...\n');
        Object.keys(allExchangeCoins).forEach(exchange => {
            const filename = `scripts/data/${exchange}-all-coins.json`;
            fs.mkdirSync('scripts/data', { recursive: true });
            fs.writeFileSync(filename, JSON.stringify(allExchangeCoins[exchange], null, 2));
            console.log(`   ✅ Saved: ${filename} (${allExchangeCoins[exchange].length} coins)`);
        });

        // STEP 2: Find common coins
        console.log('\n🔍 Step 2: Finding common coins across all exchanges...\n');

        const normalizeBase = (base) => {
            if (!base) return '';
            // Remove common prefixes
            if (base.startsWith('1000')) return base.substring(4);
            if (base.startsWith('k') && base.length > 2) return base.substring(1);
            return base.toUpperCase();
        };

        // Create a map of all unique base assets
        const allBases = new Set();
        Object.values(allExchangeCoins).forEach(coins => {
            coins.forEach(coin => {
                const normalized = normalizeBase(coin.base);
                if (normalized) allBases.add(normalized);
            });
        });

        console.log(`   📊 Total unique base assets: ${allBases.size}\n`);

        // For each base, check availability across exchanges
        const commonCoins = [];

        allBases.forEach(base => {
            const availability = {};

            // Check in each exchange
            Object.keys(allExchangeCoins).forEach(exchangeName => {
                const found = allExchangeCoins[exchangeName].find(coin =>
                    normalizeBase(coin.base) === base
                );
                availability[exchangeName] = found ? found.symbol : null;
            });

            // Count how many exchanges have this coin
            const exchangeCount = Object.values(availability).filter(v => v !== null).length;

            // Include if present in at least 2 exchanges
            if (exchangeCount >= 2) {
                commonCoins.push({
                    symbol: base,
                    name: base,
                    exchangeCount: exchangeCount,
                    binance: availability.binance,
                    okx: availability.okx,
                    bybit: availability.bybit,
                    hyperliquid: availability.hyperliquid,
                    asterdex: availability.asterdex,
                    logo: `https://cryptologos.cc/logos/${base.toLowerCase()}-logo.png`,
                    color: '#000000'
                });
            }
        });

        // Sort by exchange count (most available first), then alphabetically
        commonCoins.sort((a, b) => {
            if (b.exchangeCount !== a.exchangeCount) {
                return b.exchangeCount - a.exchangeCount;
            }
            return a.symbol.localeCompare(b.symbol);
        });

        // Save summary
        const summary = {
            totalUniqueCoins: allBases.size,
            commonCoins: commonCoins.length,
            breakdown: {
                in5Exchanges: commonCoins.filter(c => c.exchangeCount === 5).length,
                in4Exchanges: commonCoins.filter(c => c.exchangeCount === 4).length,
                in3Exchanges: commonCoins.filter(c => c.exchangeCount === 3).length,
                in2Exchanges: commonCoins.filter(c => c.exchangeCount === 2).length
            },
            exchanges: {}
        };

        Object.keys(allExchangeCoins).forEach(ex => {
            summary.exchanges[ex] = allExchangeCoins[ex].length;
        });

        fs.writeFileSync('scripts/data/summary.json', JSON.stringify(summary, null, 2));
        fs.writeFileSync('scripts/data/common-coins.json', JSON.stringify(commonCoins, null, 2));

        // Print results
        console.log('📊 FINAL RESULTS:\n');
        console.log(`   🌍 Total unique coins across all exchanges: ${allBases.size}`);
        console.log(`   ✅ Common coins (2+ exchanges): ${commonCoins.length}\n`);
        console.log('   Breakdown by exchange availability:');
        console.log(`      • All 5 exchanges: ${summary.breakdown.in5Exchanges} coins`);
        console.log(`      • 4 exchanges: ${summary.breakdown.in4Exchanges} coins`);
        console.log(`      • 3 exchanges: ${summary.breakdown.in3Exchanges} coins`);
        console.log(`      • 2 exchanges: ${summary.breakdown.in2Exchanges} coins`);

        console.log('\n📋 Sample (first 20):');
        commonCoins.slice(0, 20).forEach((coin, i) => {
            const exchanges = [];
            if (coin.binance) exchanges.push('Binance');
            if (coin.okx) exchanges.push('OKX');
            if (coin.bybit) exchanges.push('Bybit');
            if (coin.hyperliquid) exchanges.push('Hyperliquid');
            if (coin.asterdex) exchanges.push('Asterdex');

            console.log(`${(i + 1).toString().padStart(2)}. ${coin.symbol.padEnd(12)} [${coin.exchangeCount}/5] ${exchanges.join(', ')}`);
        });

        // Generate JS array
        console.log('\n\n📝 JavaScript Array Format:\n');
        console.log('const coins = [');
        commonCoins.forEach(coin => {
            const line = `    { "binance": ${coin.binance ? `"${coin.binance}"` : 'null'}, "okx": ${coin.okx ? `"${coin.okx}"` : 'null'}, "hyperliquid": ${coin.hyperliquid ? `"${coin.hyperliquid}"` : 'null'}, "bybit": ${coin.bybit ? `"${coin.bybit}"` : 'null'}, "asterdex": ${coin.asterdex ? `"${coin.asterdex}"` : 'null'}, "name": "${coin.name}", "symbol": "${coin.symbol}", "logo": "${coin.logo}", "color": "${coin.color}" },`;
            console.log(line);
        });
        console.log('];\n');

        console.log('💾 Data saved to scripts/data/');
        console.log('   - summary.json');
        console.log('   - common-coins.json');
        console.log('   - *-all-coins.json (per exchange)\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.statusText);
        }
        console.error(error.stack);
    }
}

fetchAllCoins();
