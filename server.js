const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

// WebSocket Services
const BinanceWebSocket = require('./services/websocket/binance.ws');
const OKXWebSocket = require('./services/websocket/okx.ws');
const HyperliquidWebSocket = require('./services/websocket/hyperliquid.ws');

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

const binanceWS = new BinanceWebSocket();
const okxWS = new OKXWebSocket(okxSymbols);
const hyperliquidWS = new HyperliquidWebSocket();

// Connect to Exchanges
binanceWS.connect();
okxWS.connect();
hyperliquidWS.connect();

// Initialize Arbitrage Services with WS instances
const arbitrageBinanceOKX = new ArbitrageService(
    { name: 'Binance', slug: 'binance', ws: binanceWS },
    { name: 'OKX', slug: 'okx', ws: okxWS }
);

const arbitrageOKXHyperliquid = new ArbitrageService(
    { name: 'OKX', slug: 'okx', ws: okxWS },
    { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS }
);

const arbitrageBinanceHyperliquid = new ArbitrageService(
    { name: 'Binance', slug: 'binance', ws: binanceWS },
    { name: 'Hyperliquid', slug: 'hyperliquid', ws: hyperliquidWS }
);

// API Endpoints
app.get('/api/arbitrage', (req, res) => {
    const opportunities = arbitrageBinanceOKX.getArbitrageOpportunities();
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
    // Get opportunities from cache (Sync operation now)
    const opportunitiesBinanceOKX = arbitrageBinanceOKX.getArbitrageOpportunities();
    const opportunitiesOKXHyperliquid = arbitrageOKXHyperliquid.getArbitrageOpportunities();
    const opportunitiesBinanceHyperliquid = arbitrageBinanceHyperliquid.getArbitrageOpportunities();

    const combinedData = {
        'binance-okx': opportunitiesBinanceOKX,
        'okx-hyperliquid': opportunitiesOKXHyperliquid,
        'binance-hyperliquid': opportunitiesBinanceHyperliquid
    };

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
    const opportunitiesBinanceOKX = arbitrageBinanceOKX.getArbitrageOpportunities();
    const opportunitiesOKXHyperliquid = arbitrageOKXHyperliquid.getArbitrageOpportunities();
    const opportunitiesBinanceHyperliquid = arbitrageBinanceHyperliquid.getArbitrageOpportunities();

    const combinedData = {
        'binance-okx': opportunitiesBinanceOKX,
        'okx-hyperliquid': opportunitiesOKXHyperliquid,
        'binance-hyperliquid': opportunitiesBinanceHyperliquid
    };

    ws.send(JSON.stringify({
        type: 'ARBITRAGE_UPDATE',
        data: combinedData,
        timestamp: Date.now()
    }));
}

// Broadcast data every 1 second (Much faster now!)
setInterval(broadcastData, 1000);

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket sharing same port`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});
