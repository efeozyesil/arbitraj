const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

// WebSocket Services
const BinanceWebSocket = require('./services/websocket/binance.ws');
const OKXWebSocket = require('./services/websocket/okx.ws');
const HyperliquidWebSocket = require('./services/websocket/hyperliquid.ws');
const BybitWebSocket = require('./services/websocket/bybit.ws');
const AsterdexWebSocket = require('./services/websocket/asterdex.ws');

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

const binanceWS = new BinanceWebSocket();
const okxWS = new OKXWebSocket(okxSymbols);
const hyperliquidWS = new HyperliquidWebSocket();
const bybitWS = new BybitWebSocket(bybitSymbols);
const asterdexWS = new AsterdexWebSocket();

// Connect to Exchanges
binanceWS.connect();
okxWS.connect();
hyperliquidWS.connect();
bybitWS.connect();
asterdexWS.connect();

// Initialize ALL Arbitrage Services (10 pairs from 5 exchanges)
const arbitragePairs = [
    { name: 'binance-okx', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'OKX', slug: 'okx', ws: okxWS } },
    { name: 'binance-hyperliquid', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS } },
    { name: 'binance-bybit', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Bybit', slug: 'bybit', ws: bybitWS } },
    { name: 'binance-asterdex', a: { name: 'Binance', slug: 'binance', ws: binanceWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'okx-hyperliquid', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS } },
    { name: 'okx-bybit', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Bybit', slug: 'bybit', ws: bybitWS } },
    { name: 'okx-asterdex', a: { name: 'OKX', slug: 'okx', ws: okxWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'hyperliquid-bybit', a: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS }, b: { name: 'Bybit', slug: 'bybit', ws: bybitWS } },
    { name: 'hyperliquid-asterdex', a: { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } },
    { name: 'bybit-asterdex', a: { name: 'Bybit', slug: 'bybit', ws: bybitWS }, b: { name: 'Asterdex', slug: 'asterdex', ws: asterdexWS } }
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
function broadcastData() {
    // Get opportunities from all pairs
    const combinedData = {};

    arbitragePairs.forEach(pair => {
        combinedData[pair.name] = arbitrageServices[pair.name].getArbitrageOpportunities();
    });

    const message = JSON.stringify({
        type: 'ARBITRAGE_UPDATE',
        data: combinedData,
        timestamp: Date.now()
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}


function sendDataToClient(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        const combinedData = {};

        arbitragePairs.forEach(pair => {
            combinedData[pair.name] = arbitrageServices[pair.name].getArbitrageOpportunities();
        });

        const message = JSON.stringify({
            type: 'ARBITRAGE_UPDATE',
            data: combinedData,
            timestamp: Date.now()
        });

        ws.send(message);
    }
}


// Broadcast data every 1 second (Much faster now!)
setInterval(broadcastData, 1000);

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket sharing same port`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});
