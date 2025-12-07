const ArbitrageService = require('./services/arbitrage.service');
const { calculateDetailedFunding } = require('./services/funding-calculator');

// Mock Data
const dataA = {
    symbol: 'BTCUSDT',
    markPrice: '100000',
    fundingRate: '0.01', // 0.01%
    nextFundingTime: Date.now() + 3600000 * 8, // 8h later
    fundingInterval: 8
};

const dataB = {
    symbol: 'BTC-USDT-SWAP',
    markPrice: '100050', // Premium
    fundingRate: '0.04', // 0.04%
    nextFundingTime: Date.now() + 3600000 * 8, // 8h later
    fundingInterval: 8
};

// Mock Exchanges
const exA = { name: 'Binance', slug: 'binance', ws: { getData: () => dataA } };
const exB = { name: 'OKX', slug: 'okx', ws: { getData: () => dataB } };

console.log('--- STARTING DEBUG ---');

try {
    const service = new ArbitrageService(exA, exB);

    // Direct Calculation Test
    console.log('Testing calculateDetailedFunding...');
    const calc = calculateDetailedFunding('Binance', 'OKX', dataA, dataB, 'LONG_A_SHORT_B', 100);
    console.log('Calculation Result:', JSON.stringify(calc, null, 2));

    // Arbitrage Analysis Test
    console.log('\nTesting analyzeArbitrage...');
    const analysis = service.analyzeArbitrage(dataA, dataB, 'BTCUSDT', 'BTC-USDT-SWAP');
    console.log('Analysis Result:', analysis);

    if (!analysis) {
        console.error('❌ Analysis returned NULL. Check filters or error handling.');
    } else if (!analysis.isOpportunity) {
        console.warn('⚠️ Opportunity flag is FALSE. Reason:', analysis.reason);
    } else {
        console.log('✅ Opportunity FOUND!');
    }

} catch (err) {
    console.error('🔥 CRITICAL ERROR:', err);
}
