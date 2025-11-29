require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const BinanceService = require('./services/binance.service');
const OKXService = require('./services/okx.service');
const ArbitrageService = require('./services/arbitrage.service');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Services initialization - Public API kullanımı (API key gerekmez)
console.log('🚀 Starting Crypto Arbitrage Dashboard...');
console.log('📊 Using PUBLIC APIs (no API keys required for viewing data)');

const binanceService = new BinanceService(null, null);
const okxService = new OKXService(null, null, null);
const arbitrageService = new ArbitrageService(binanceService, okxService);

// REST API Endpoints
app.get('/api/opportunities', async (req, res) => {
    try {
        console.log('📡 Fetching arbitrage opportunities...');
        const opportunities = await arbitrageService.getArbitrageOpportunities();
        console.log(`✅ Found ${opportunities.length} opportunities`);

        res.json({
            success: true,
            data: opportunities,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('❌ Error fetching opportunities:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        mode: 'PUBLIC_API',
        timestamp: new Date(),
        message: 'Using public APIs - no authentication required for viewing data'
    });
});

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`🔌 WebSocket Server starting on port ${WS_PORT}...`);

wss.on('connection', (ws) => {
    console.log('✅ Client connected to WebSocket');

    // Her 15 saniyede bir güncel verileri gönder
    const interval = setInterval(async () => {
        try {
            const opportunities = await arbitrageService.getArbitrageOpportunities();

            ws.send(JSON.stringify({
                type: 'ARBITRAGE_UPDATE',
                data: opportunities,
                timestamp: new Date()
            }));
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    }, 15000);

    // İlk veriyi hemen gönder
    arbitrageService.getArbitrageOpportunities()
        .then(opportunities => {
            ws.send(JSON.stringify({
                type: 'ARBITRAGE_UPDATE',
                data: opportunities,
                timestamp: new Date()
            }));
        })
        .catch(error => console.error('Initial data error:', error));

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(interval);
    });
});

// Start HTTP Server
app.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket Server running on ws://localhost:${WS_PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});
