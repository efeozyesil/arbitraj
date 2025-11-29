require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const BinanceService = require('./services/binance.service');
const OKXService = require('./services/okx.service');
const HyperliquidService = require('./services/hyperliquid.service');
const ArbitrageService = require('./services/arbitrage.service');

const app = express();
const server = http.createServer(app); // Create HTTP server
const wss = new WebSocket.Server({ server }); // Attach WebSocket to HTTP server

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Services initialization
console.log('🚀 Starting Crypto Arbitrage Dashboard...');
console.log('📊 Using PUBLIC APIs (no API keys required for viewing data)');

const binanceService = new BinanceService(null, null);
const okxService = new OKXService(null, null, null);
const hyperliquidService = new HyperliquidService();

// 3 ayrı arbitrage servisi (3 borsa çifti için)
const arbitrageBinanceOKX = new ArbitrageService(binanceService, okxService);
const arbitrageOKXHyperliquid = new ArbitrageService(okxService, hyperliquidService);
const arbitrageBinanceHyperliquid = new ArbitrageService(binanceService, hyperliquidService);

// REST API Endpoints
app.get('/api/opportunities', async (req, res) => {
    try {
        const opportunities = await arbitrageBinanceOKX.getArbitrageOpportunities();
        res.json(opportunities);
    } catch (error) {
        console.error('Error fetching arbitrage opportunities:', error);
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

// Hyperliquid test endpoint
app.get('/api/test-hyperliquid', async (req, res) => {
    try {
        const testCoins = ['BTC', 'ETH', 'SOL'];
        const data = await hyperliquidService.getMultipleFundingData(testCoins);
        res.json({
            success: true,
            data: data,
            message: 'Hyperliquid API çalışıyor!'
        });
    } catch (error) {
        console.error('Hyperliquid test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// WebSocket Connection
wss.on('connection', (ws) => {
    console.log('✅ Client connected to WebSocket');

    // Send initial data immediately
    sendDataToClient(ws);

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast data to all clients
async function broadcastData() {
    try {
        const opportunities = await arbitrageBinanceOKX.getArbitrageOpportunities();

        const data = JSON.stringify({
            type: 'ARBITRAGE_UPDATE',
            timestamp: new Date().toISOString(),
            data: opportunities
        });

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    } catch (error) {
        console.error('Error broadcasting data:', error);
    }
}

// Send data to a single client
async function sendDataToClient(ws) {
    try {
        const opportunities = await arbitrageBinanceOKX.getArbitrageOpportunities();

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ARBITRAGE_UPDATE',
                timestamp: new Date().toISOString(),
                data: opportunities
            }));
        }
    } catch (error) {
        console.error('Error sending data to client:', error);
    }
}

// Periodic update (Every 5 seconds)
setInterval(broadcastData, 5000);

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket sharing same port`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});
