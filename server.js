const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

// Perpetual Futures WebSocket Services
const BinanceWebSocket = require('./services/websocket/binance.ws');
const OKXWebSocket = require('./services/websocket/okx.ws');
const HyperliquidWebSocket = require('./services/websocket/hyperliquid.ws');
const BybitWebSocket = require('./services/websocket/bybit.ws');
const AsterdexWebSocket = require('./services/websocket/asterdex.ws');

// Turkish Exchange Services (USDT/TRY)
const BinanceTRWebSocket = require('./services/websocket/binancetr.ws');
const BTCTurkWebSocket = require('./services/websocket/btcturk.ws');
const OKXTRWebSocket = require('./services/websocket/okxtr.ws');
const ParibuService = require('./services/websocket/paribu.service');

const ArbitrageService = require('./services/arbitrage.service');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// Initialize WebSocket Services
console.log('🚀 Starting Crypto Arbitrage Dashboard...');
console.log('🔌 Connecting to Exchange WebSockets...');

// Get all coins to subscribe
const allCoins = ArbitrageService.getCoinList();
const okxSymbols = allCoins.map(c => c.okx).filter(s => s);
const bybitSymbols = allCoins.map(c => c.bybit).filter(s => s);

// Perpetual Futures Exchanges
const binanceWS = new BinanceWebSocket();
const okxWS = new OKXWebSocket(okxSymbols);
const hyperliquidWS = new HyperliquidWebSocket();
const bybitWS = new BybitWebSocket(bybitSymbols);
const asterdexWS = new AsterdexWebSocket();

// Turkish Exchanges (USDT/TRY)
const binanceTRWS = new BinanceTRWebSocket();
const btcturkWS = new BTCTurkWebSocket();
const okxTRWS = new OKXTRWebSocket();
const paribuService = new ParibuService();

const metadataService = require('./services/metadata.service');

// Initialize Services
async function startServer() {
    try {
        console.log('Fetching metadata...');
        // 1. Fetch metadata (funding intervals) first - Fail gracefully
        try {
            await metadataService.initialize();
        } catch (err) {
            console.error('Metadata fetch failed (continuing with fallbacks):', err.message);
        }

        // 2. Start WebSocket Connections (Perpetual Futures)
        console.log('Connecting to Perpetual Futures WebSockets...');
        binanceWS.connect();
        okxWS.connect();
        hyperliquidWS.connect();
        bybitWS.connect();
        asterdexWS.connect();

        // 3. Start Turkish Exchange Connections (USDT/TRY)
        console.log('Connecting to Turkish Exchange WebSockets...');
        binanceTRWS.connect();
        btcturkWS.connect();
        okxTRWS.connect();
        paribuService.connect();

        // 4. Services are now ready and listening
        console.log('Services initialized.');

        // Start Server
        server.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🔌 WebSocket sharing same port`);
            console.log(`📊 Dashboard available at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('CRITICAL: Failed to start server:', error);
    }
}


// Initialize ALL Arbitrage Services (10 pairs from 5 exchanges)
// NOTE: Pair names MUST match frontend sidebar IDs exactly
const arbitragePairs = [
    { name: 'binance-okx', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'OKX', slug: 'okx', ws: okxWS } },
    { name: 'binance-hyperliquid', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS } },
    { name: 'binance-bybit', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Bybit', slug: 'bybit', ws: bybitWS } },
    { name: 'binance-asterdex', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'okx-hyperliquid', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS } },
    { name: 'okx-bybit', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Bybit', slug: 'bybit', ws: bybitWS } },
    { name: 'okx-asterdex', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'bybit-hyperliquid', a: { name: 'Bybit', slug: 'bybit', ws: bybitWS }, b: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS } },
    { name: 'bybit-asterdex', a: { name: 'Bybit', slug: 'bybit', ws: bybitWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'hyperliquid-asterdex', a: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } }
];

const arbitrageServices = {};
arbitragePairs.forEach(pair => {
    arbitrageServices[pair.name] = new ArbitrageService(pair.a, pair.b);
});

// API Endpoints
app.get('/api/arbitrage', (req, res) => {
    const opportunities = arbitrageServices['binance-okx'].getArbitrageOpportunities();
    res.json(opportunities);
});

// WebSocket Connection Handling (Frontend Clients)
wss.on('connection', (ws) => {
    console.log('✅ Client connected to WebSocket');

    // Send initial data immediately
    sendDataToClient(ws);

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Broadcast data to all connected clients
// Broadcast data to all connected clients
function broadcastData() {
    // 1. Get Top 10 Opportunities for each pair
    const combinedData = {};

    arbitragePairs.forEach(pair => {
        const allOpps = arbitrageServices[pair.name].getArbitrageOpportunities();
        // Server-side sorting (already sorted in service) and slicing
        combinedData[pair.name] = allOpps.slice(0, 10);
    });

    // 2. Get Consolidated All Data (All Coins x All Exchanges)
    const allCoinsData = getAllExchangeData();

    // 3. TRY Arbitrage Data (Placeholder - TODO: integrate real Turkish exchange APIs)
    const tryData = getTRYData();

    // 4. USDC Arbitrage Data (Placeholder - TODO: integrate real USDC/USDT pairs)
    const usdcData = getUSDCData();

    const message = JSON.stringify({
        type: 'ARBITRAGE_UPDATE',
        data: combinedData,
        allData: allCoinsData,
        tryData: tryData,
        usdcData: usdcData,
        timestamp: Date.now()
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}
// TRY/USDT data from Turkish exchanges (REAL DATA)
function getTRYData() {
    const binanceTR = binanceTRWS.getData();
    const btcturk = btcturkWS.getData();
    const okxTR = okxTRWS.getData();
    const paribu = paribuService.getData();

    // Helper to check if data is valid (has recent timestamp)
    const isValid = (data) => data && data.timestamp > 0 && (data.bid > 0 || data.ask > 0);

    const result = [];

    if (isValid(binanceTR)) {
        result.push({ name: 'Binance TR', bid: binanceTR.bid, ask: binanceTR.ask, last: binanceTR.last });
    }

    if (isValid(btcturk)) {
        result.push({ name: 'BTCTurk', bid: btcturk.bid, ask: btcturk.ask, last: btcturk.last });
    }

    if (isValid(okxTR)) {
        result.push({ name: 'OKX TR', bid: okxTR.bid, ask: okxTR.ask, last: okxTR.last });
    }

    if (isValid(paribu)) {
        result.push({ name: 'Paribu', bid: paribu.bid, ask: paribu.ask, last: paribu.last });
    }

    // If no real data yet, return placeholder with zeros
    if (result.length === 0) {
        return [
            { name: 'Binance TR', bid: 0, ask: 0, last: 0 },
            { name: 'BTCTurk', bid: 0, ask: 0, last: 0 },
            { name: 'OKX TR', bid: 0, ask: 0, last: 0 },
            { name: 'Paribu', bid: 0, ask: 0, last: 0 }
        ];
    }

    return result;
}

// USDC/USDT data (simulated for now)
function getUSDCData() {
    // TODO: Integrate real data from:
    // - Binance USDC/USDT spot
    // - OKX USDC/USDT spot
    // - Bybit USDC/USDT spot

    return [
        { exchange: 'Binance', pair: 'USDC/USDT', bid: 0.9998 + Math.random() * 0.0002, ask: 1.0001 + Math.random() * 0.0001 },
        { exchange: 'OKX', pair: 'USDC/USDT', bid: 0.9997 + Math.random() * 0.0002, ask: 1.0002 + Math.random() * 0.0001 },
        { exchange: 'Bybit', pair: 'USDC/USDT', bid: 0.9999 + Math.random() * 0.0002, ask: 1.0001 + Math.random() * 0.0001 }
    ];
}

function getAllExchangeData() {
    const coins = ArbitrageService.getCoinList();

    return coins.map(coin => {
        const binanceData = binanceWS.getData(coin.binance);
        const okxData = okxWS.getData(coin.okx);
        const hyperliquidData = hyperliquidWS.getData(coin.hyperliquid);
        const bybitData = bybitWS.getData(coin.bybit);
        const asterdexData = asterdexWS.getData(coin.asterdex);

        return {
            symbol: coin.symbol,
            name: coin.name,
            logo: coin.logo,
            binance: binanceData ? { price: binanceData.markPrice, funding: binanceData.fundingRate } : null,
            okx: okxData ? { price: okxData.markPrice, funding: okxData.fundingRate } : null,
            hyperliquid: hyperliquidData ? { price: hyperliquidData.markPrice, funding: hyperliquidData.fundingRate } : null,
            bybit: bybitData ? { price: bybitData.markPrice, funding: bybitData.fundingRate } : null,
            asterdex: asterdexData ? { price: asterdexData.markPrice, funding: asterdexData.fundingRate } : null
        };
    });
}


function sendDataToClient(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        const combinedData = {};

        arbitragePairs.forEach(pair => {
            const allOpps = arbitrageServices[pair.name].getArbitrageOpportunities();
            combinedData[pair.name] = allOpps.slice(0, 10);
        });

        const allCoinsData = getAllExchangeData();

        const message = JSON.stringify({
            type: 'ARBITRAGE_UPDATE',
            data: combinedData,
            allData: allCoinsData,
            timestamp: Date.now()
        });

        ws.send(message);
    }
}


// Broadcast data every 1 second (Much faster now!)
setInterval(broadcastData, 1000);

// Start the server initialization
startServer();
