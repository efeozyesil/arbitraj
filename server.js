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
        const opportunities = await arbitrageService.getArbitrageOpportunities();
        res.json(opportunities);
    } catch (error) {
        console.error('Error fetching arbitrage opportunities:', error);
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

// WebSocket bağlantısı
wss.on('connection', (ws) => {
    console.log('✅ Client connected to WebSocket');

    // İlk bağlantıda hemen veri gönder
    sendDataToClient(ws);

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Tüm clientlara veri gönder
async function broadcastData() {
    try {
        const opportunities = await arbitrageService.getArbitrageOpportunities();

        const data = JSON.stringify({
            type: 'UPDATE',
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

// Tek bir client'a veri gönder
async function sendDataToClient(ws) {
    try {
        const opportunities = await arbitrageService.getArbitrageOpportunities();

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'UPDATE',
                timestamp: new Date().toISOString(),
                data: opportunities
            }));
        }
    } catch (error) {
        console.error('Error sending data to client:', error);
    }
}

// Periyodik güncelleme (Her 5 saniyede bir)
setInterval(broadcastData, 5000);

// Sunucuyu başlat
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket sharing same port`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});
