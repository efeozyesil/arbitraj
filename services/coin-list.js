// Auto-generated coin list from fetch-common-coins.js
// Total: 541 coins across 5 exchanges
// Last updated: 2025-12-06

const coins = require('../scripts/data/common-coins.json').map(coin => ({
    binance: coin.binance,
    okx: coin.okx,
    hyperliquid: coin.hyperliquid,
    bybit: coin.bybit,
    asterdex: coin.asterdex,
    name: coin.name,
    symbol: coin.symbol,
    logo: coin.logo || `https://via.placeholder.com/32/000000/FFFFFF?text=${coin.symbol}`,
    color: coin.color || '#000000'
}));

module.exports = coins;
