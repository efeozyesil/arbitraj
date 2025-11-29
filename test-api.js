require('dotenv').config();
const BinanceService = require('./services/binance.service');
const OKXService = require('./services/okx.service');

console.log('🧪 Testing API Connections...\n');

// Test Binance
async function testBinance() {
    console.log('📊 Testing Binance API...');

    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
        console.log('❌ Binance API keys not found in .env file\n');
        return false;
    }

    try {
        const binance = new BinanceService(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET
        );

        const btcData = await binance.getPremiumIndex('BTCUSDT');

        if (btcData) {
            console.log('✅ Binance API working!');
            console.log(`   BTC Mark Price: $${parseFloat(btcData.markPrice).toLocaleString()}`);
            console.log(`   Funding Rate: ${(parseFloat(btcData.lastFundingRate) * 100).toFixed(4)}%\n`);
            return true;
        } else {
            console.log('❌ Failed to fetch data from Binance\n');
            return false;
        }
    } catch (error) {
        console.log('❌ Binance API Error:', error.message, '\n');
        return false;
    }
}

// Test OKX
async function testOKX() {
    console.log('📊 Testing OKX API...');

    if (!process.env.OKX_API_KEY || !process.env.OKX_API_SECRET || !process.env.OKX_PASSPHRASE) {
        console.log('❌ OKX API keys not found in .env file\n');
        return false;
    }

    try {
        const okx = new OKXService(
            process.env.OKX_API_KEY,
            process.env.OKX_API_SECRET,
            process.env.OKX_PASSPHRASE
        );

        const btcFunding = await okx.getFundingRate('BTC-USDT-SWAP');
        const btcPrice = await okx.getMarkPrice('BTC-USDT-SWAP');

        if (btcFunding && btcPrice) {
            console.log('✅ OKX API working!');
            console.log(`   BTC Mark Price: $${parseFloat(btcPrice.markPx).toLocaleString()}`);
            console.log(`   Funding Rate: ${(parseFloat(btcFunding.fundingRate) * 100).toFixed(4)}%\n`);
            return true;
        } else {
            console.log('❌ Failed to fetch data from OKX\n');
            return false;
        }
    } catch (error) {
        console.log('❌ OKX API Error:', error.message, '\n');
        return false;
    }
}

// Run tests
async function runTests() {
    const binanceOk = await testBinance();
    const okxOk = await testOKX();

    console.log('═══════════════════════════════════════');
    if (binanceOk && okxOk) {
        console.log('✅ All tests passed! You can now run: npm start');
    } else {
        console.log('❌ Some tests failed. Please check your API keys in .env file');
        console.log('\nMake sure you have:');
        console.log('1. Created API keys on both exchanges');
        console.log('2. Added them to the .env file');
        console.log('3. Given proper permissions (Read Info, Enable Futures)');
    }
    console.log('═══════════════════════════════════════');
}

runTests();
