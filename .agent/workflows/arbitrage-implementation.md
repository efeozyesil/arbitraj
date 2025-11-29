---
description: Binance-OKX Arbitraj Sistemi Implementation Planı
---

# Binance-OKX Funding Rate Arbitraj Sistemi - Detaylı Implementation Planı

## 📋 Proje Genel Bakış

Bu sistem, Binance ve OKX borsaları arasında funding rate farklarını tespit edip, otomatik arbitraj işlemleri gerçekleştirecek ve bir dashboard üzerinden takip edilebilecek bir platformdur.

## 🎯 Temel Özellikler

1. **Real-time Funding Rate Monitoring**: Her iki borsadan da anlık funding rate verilerini çekme
2. **Arbitraj Fırsatı Tespiti**: Karlı arbitraj fırsatlarını otomatik tespit etme
3. **Otomatik Trade Execution**: Belirlenen kriterlere göre otomatik işlem yapma
4. **Dashboard**: Web tabanlı izleme ve kontrol paneli
5. **Risk Yönetimi**: Position limitleri, stop-loss mekanizmaları
6. **Bildirim Sistemi**: Önemli olaylar için alert sistemi

---

## 📚 AŞAMA 1: Araştırma ve Hazırlık (1-2 Gün)

### 1.1 API Dokümantasyonunu İnceleme

**Binance API Endpoints:**
- `GET /fapi/v1/fundingRate` - Funding rate geçmişi
- `GET /fapi/v1/premiumIndex` - Güncel funding rate ve mark price
- `GET /fapi/v2/account` - Hesap bilgileri
- `POST /fapi/v1/order` - Emir oluşturma
- `GET /fapi/v1/exchangeInfo` - Trading pair bilgileri

**OKX API Endpoints:**
- `GET /api/v5/public/funding-rate` - Güncel funding rate
- `GET /api/v5/public/funding-rate-history` - Funding rate geçmişi
- `GET /api/v5/account/balance` - Hesap bakiyesi
- `POST /api/v5/trade/order` - Emir oluşturma
- `GET /api/v5/public/instruments` - Trading pair bilgileri

### 1.2 API Key ve Secret Oluşturma

**Binance için:**
1. Binance hesabına giriş yap
2. API Management bölümüne git
3. Yeni API key oluştur
4. İzinleri ayarla: Read Info, Enable Futures, Enable Trading
5. IP whitelist ekle (güvenlik için)

**OKX için:**
1. OKX hesabına giriş yap
2. API Management bölümüne git
3. Yeni API key oluştur
4. İzinleri ayarla: Read, Trade
5. Passphrase belirle
6. IP whitelist ekle

### 1.3 Gerekli Teknolojileri Belirleme

**Backend:**
- Node.js (v18+)
- TypeScript (tip güvenliği için)
- Express.js (API server)
- WebSocket (real-time data)
- PostgreSQL veya MongoDB (veri saklama)
- Redis (caching ve rate limiting)

**Frontend:**
- React.js veya Next.js
- TailwindCSS (styling)
- Chart.js veya Recharts (grafikler)
- WebSocket client (real-time updates)

**DevOps:**
- Docker (containerization)
- PM2 (process management)
- Nginx (reverse proxy)

---

## 🏗️ AŞAMA 2: Proje Yapısını Oluşturma (1 Gün)

### 2.1 Klasör Yapısı

```
crypto-arbitrage/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── binance.config.ts
│   │   │   ├── okx.config.ts
│   │   │   └── database.config.ts
│   │   ├── services/
│   │   │   ├── binance.service.ts
│   │   │   ├── okx.service.ts
│   │   │   ├── arbitrage.service.ts
│   │   │   └── trading.service.ts
│   │   ├── models/
│   │   │   ├── FundingRate.model.ts
│   │   │   ├── Trade.model.ts
│   │   │   └── Position.model.ts
│   │   ├── controllers/
│   │   │   ├── arbitrage.controller.ts
│   │   │   └── dashboard.controller.ts
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── calculator.ts
│   │   │   └── validator.ts
│   │   ├── websocket/
│   │   │   └── ws.handler.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── FundingRateChart.tsx
│   │   │   ├── PositionTable.tsx
│   │   │   └── TradeHistory.tsx
│   │   ├── services/
│   │   │   └── api.service.ts
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── App.tsx
│   └── package.json
├── docker-compose.yml
└── README.md
```

### 2.2 Temel Paketleri Yükleme

**Backend:**
```bash
npm init -y
npm install express typescript @types/node @types/express
npm install axios ws ccxt
npm install dotenv
npm install pg mongoose redis
npm install winston (logging)
npm install joi (validation)
```

**Frontend:**
```bash
npx create-next-app@latest frontend
cd frontend
npm install axios recharts
npm install @tanstack/react-query
```

---

## 💻 AŞAMA 3: Backend Geliştirme (5-7 Gün)

### 3.1 Exchange Service'leri Oluşturma (2 Gün)

#### Binance Service (`binance.service.ts`)

```typescript
import axios from 'axios';
import crypto from 'crypto';

export class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseURL = 'https://fapi.binance.com';

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // HMAC SHA256 signature oluşturma
  private createSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  // Güncel funding rate'i çekme
  async getCurrentFundingRate(symbol: string) {
    const endpoint = '/fapi/v1/premiumIndex';
    const response = await axios.get(`${this.baseURL}${endpoint}`, {
      params: { symbol }
    });
    return response.data;
  }

  // Funding rate geçmişi
  async getFundingRateHistory(symbol: string, limit = 100) {
    const endpoint = '/fapi/v1/fundingRate';
    const response = await axios.get(`${this.baseURL}${endpoint}`, {
      params: { symbol, limit }
    });
    return response.data;
  }

  // Hesap bilgileri
  async getAccountInfo() {
    const endpoint = '/fapi/v2/account';
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = this.createSignature(queryString);

    const response = await axios.get(`${this.baseURL}${endpoint}`, {
      params: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': this.apiKey }
    });
    return response.data;
  }

  // Pozisyon açma (LONG veya SHORT)
  async openPosition(symbol: string, side: 'BUY' | 'SELL', quantity: number) {
    const endpoint = '/fapi/v1/order';
    const timestamp = Date.now();
    
    const params = {
      symbol,
      side,
      type: 'MARKET',
      quantity,
      timestamp
    };

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    const signature = this.createSignature(queryString);

    const response = await axios.post(
      `${this.baseURL}${endpoint}`,
      null,
      {
        params: { ...params, signature },
        headers: { 'X-MBX-APIKEY': this.apiKey }
      }
    );
    return response.data;
  }

  // Pozisyon kapatma
  async closePosition(symbol: string, side: 'BUY' | 'SELL', quantity: number) {
    // Pozisyon kapatmak için ters yönde işlem yapılır
    const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
    return this.openPosition(symbol, closeSide, quantity);
  }
}
```

#### OKX Service (`okx.service.ts`)

```typescript
import axios from 'axios';
import crypto from 'crypto';

export class OKXService {
  private apiKey: string;
  private apiSecret: string;
  private passphrase: string;
  private baseURL = 'https://www.okx.com';

  constructor(apiKey: string, apiSecret: string, passphrase: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
  }

  // OKX signature oluşturma
  private createSignature(timestamp: string, method: string, path: string, body = ''): string {
    const message = timestamp + method + path + body;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
  }

  // Headers oluşturma
  private getHeaders(method: string, path: string, body = '') {
    const timestamp = new Date().toISOString();
    const signature = this.createSignature(timestamp, method, path, body);

    return {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json'
    };
  }

  // Güncel funding rate
  async getCurrentFundingRate(instId: string) {
    const path = '/api/v5/public/funding-rate';
    const response = await axios.get(`${this.baseURL}${path}`, {
      params: { instId }
    });
    return response.data;
  }

  // Funding rate geçmişi
  async getFundingRateHistory(instId: string, limit = 100) {
    const path = '/api/v5/public/funding-rate-history';
    const response = await axios.get(`${this.baseURL}${path}`, {
      params: { instId, limit }
    });
    return response.data;
  }

  // Hesap bakiyesi
  async getAccountBalance() {
    const method = 'GET';
    const path = '/api/v5/account/balance';
    
    const response = await axios.get(`${this.baseURL}${path}`, {
      headers: this.getHeaders(method, path)
    });
    return response.data;
  }

  // Pozisyon açma
  async openPosition(instId: string, side: 'buy' | 'sell', size: string) {
    const method = 'POST';
    const path = '/api/v5/trade/order';
    
    const body = JSON.stringify({
      instId,
      tdMode: 'cross', // cross margin
      side,
      ordType: 'market',
      sz: size
    });

    const response = await axios.post(
      `${this.baseURL}${path}`,
      body,
      { headers: this.getHeaders(method, path, body) }
    );
    return response.data;
  }

  // Pozisyon kapatma
  async closePosition(instId: string, side: 'buy' | 'sell', size: string) {
    const closeSide = side === 'buy' ? 'sell' : 'buy';
    return this.openPosition(instId, closeSide, size);
  }
}
```

### 3.2 Arbitrage Service Oluşturma (2 Gün)

#### Arbitrage Service (`arbitrage.service.ts`)

```typescript
import { BinanceService } from './binance.service';
import { OKXService } from './okx.service';
import { Logger } from '../utils/logger';

interface ArbitrageOpportunity {
  symbol: string;
  binanceFundingRate: number;
  okxFundingRate: number;
  difference: number;
  profitability: number;
  action: 'BINANCE_SHORT_OKX_LONG' | 'BINANCE_LONG_OKX_SHORT' | 'NONE';
  timestamp: Date;
}

export class ArbitrageService {
  private binance: BinanceService;
  private okx: OKXService;
  private logger: Logger;
  private minProfitThreshold: number; // Minimum kar eşiği (örn: 0.05%)

  constructor(
    binance: BinanceService,
    okx: OKXService,
    minProfitThreshold = 0.05
  ) {
    this.binance = binance;
    this.okx = okx;
    this.logger = new Logger('ArbitrageService');
    this.minProfitThreshold = minProfitThreshold;
  }

  // Funding rate'leri karşılaştır ve arbitraj fırsatı bul
  async findArbitrageOpportunity(symbol: string): Promise<ArbitrageOpportunity> {
    try {
      // Binance funding rate (örn: BTCUSDT)
      const binanceData = await this.binance.getCurrentFundingRate(symbol);
      const binanceFundingRate = parseFloat(binanceData.lastFundingRate) * 100;

      // OKX funding rate (örn: BTC-USDT-SWAP)
      const okxSymbol = this.convertToOKXSymbol(symbol);
      const okxData = await this.okx.getCurrentFundingRate(okxSymbol);
      const okxFundingRate = parseFloat(okxData.data[0].fundingRate) * 100;

      // Fark hesaplama
      const difference = Math.abs(binanceFundingRate - okxFundingRate);
      
      // Karlılık hesaplama (8 saatlik funding için)
      const profitability = difference;

      // Aksiyon belirleme
      let action: ArbitrageOpportunity['action'] = 'NONE';
      
      if (difference >= this.minProfitThreshold) {
        if (binanceFundingRate < okxFundingRate) {
          // Binance'de LONG, OKX'te SHORT aç
          action = 'BINANCE_LONG_OKX_SHORT';
        } else {
          // Binance'de SHORT, OKX'te LONG aç
          action = 'BINANCE_SHORT_OKX_LONG';
        }
      }

      const opportunity: ArbitrageOpportunity = {
        symbol,
        binanceFundingRate,
        okxFundingRate,
        difference,
        profitability,
        action,
        timestamp: new Date()
      };

      this.logger.info('Arbitrage opportunity analyzed', opportunity);
      return opportunity;

    } catch (error) {
      this.logger.error('Error finding arbitrage opportunity', error);
      throw error;
    }
  }

  // Arbitraj işlemini otomatik gerçekleştir
  async executeArbitrage(
    opportunity: ArbitrageOpportunity,
    positionSize: number
  ) {
    if (opportunity.action === 'NONE') {
      this.logger.info('No profitable arbitrage opportunity');
      return null;
    }

    try {
      const okxSymbol = this.convertToOKXSymbol(opportunity.symbol);

      if (opportunity.action === 'BINANCE_SHORT_OKX_LONG') {
        // Binance'de SHORT pozisyon aç
        const binanceTrade = await this.binance.openPosition(
          opportunity.symbol,
          'SELL',
          positionSize
        );

        // OKX'te LONG pozisyon aç
        const okxTrade = await this.okx.openPosition(
          okxSymbol,
          'buy',
          positionSize.toString()
        );

        this.logger.info('Arbitrage executed: BINANCE SHORT, OKX LONG', {
          binanceTrade,
          okxTrade
        });

        return { binanceTrade, okxTrade };

      } else if (opportunity.action === 'BINANCE_LONG_OKX_SHORT') {
        // Binance'de LONG pozisyon aç
        const binanceTrade = await this.binance.openPosition(
          opportunity.symbol,
          'BUY',
          positionSize
        );

        // OKX'te SHORT pozisyon aç
        const okxTrade = await this.okx.openPosition(
          okxSymbol,
          'sell',
          positionSize.toString()
        );

        this.logger.info('Arbitrage executed: BINANCE LONG, OKX SHORT', {
          binanceTrade,
          okxTrade
        });

        return { binanceTrade, okxTrade };
      }

    } catch (error) {
      this.logger.error('Error executing arbitrage', error);
      throw error;
    }
  }

  // Binance sembolünü OKX formatına çevir
  private convertToOKXSymbol(binanceSymbol: string): string {
    // BTCUSDT -> BTC-USDT-SWAP
    const base = binanceSymbol.replace('USDT', '');
    return `${base}-USDT-SWAP`;
  }

  // Birden fazla sembol için tarama
  async scanMultipleSymbols(symbols: string[]): Promise<ArbitrageOpportunity[]> {
    const opportunities = await Promise.all(
      symbols.map(symbol => this.findArbitrageOpportunity(symbol))
    );

    // Sadece karlı fırsatları döndür
    return opportunities.filter(opp => opp.action !== 'NONE');
  }
}
```

### 3.3 Database Models (1 Gün)

#### Funding Rate Model (`FundingRate.model.ts`)

```typescript
import mongoose from 'mongoose';

const fundingRateSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  exchange: { type: String, enum: ['binance', 'okx'], required: true },
  fundingRate: { type: Number, required: true },
  fundingTime: { type: Date, required: true },
  markPrice: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

fundingRateSchema.index({ symbol: 1, exchange: 1, fundingTime: -1 });

export const FundingRate = mongoose.model('FundingRate', fundingRateSchema);
```

#### Trade Model (`Trade.model.ts`)

```typescript
import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  strategy: { type: String, required: true },
  binanceSide: { type: String, enum: ['BUY', 'SELL'], required: true },
  okxSide: { type: String, enum: ['buy', 'sell'], required: true },
  quantity: { type: Number, required: true },
  binanceOrderId: { type: String },
  okxOrderId: { type: String },
  expectedProfit: { type: Number },
  actualProfit: { type: Number },
  status: { 
    type: String, 
    enum: ['OPEN', 'CLOSED', 'FAILED'], 
    default: 'OPEN' 
  },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date }
});

export const Trade = mongoose.model('Trade', tradeSchema);
```

### 3.4 REST API Endpoints (1 Gün)

#### Dashboard Controller (`dashboard.controller.ts`)

```typescript
import { Request, Response } from 'express';
import { ArbitrageService } from '../services/arbitrage.service';
import { FundingRate } from '../models/FundingRate.model';
import { Trade } from '../models/Trade.model';

export class DashboardController {
  private arbitrageService: ArbitrageService;

  constructor(arbitrageService: ArbitrageService) {
    this.arbitrageService = arbitrageService;
  }

  // Güncel arbitraj fırsatlarını getir
  async getCurrentOpportunities(req: Request, res: Response) {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
      const opportunities = await this.arbitrageService.scanMultipleSymbols(symbols);
      
      res.json({
        success: true,
        data: opportunities
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Funding rate geçmişi
  async getFundingRateHistory(req: Request, res: Response) {
    try {
      const { symbol, exchange, limit = 100 } = req.query;
      
      const history = await FundingRate.find({
        symbol,
        exchange
      })
        .sort({ fundingTime: -1 })
        .limit(Number(limit));

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Açık pozisyonları getir
  async getOpenPositions(req: Request, res: Response) {
    try {
      const openTrades = await Trade.find({ status: 'OPEN' });
      
      res.json({
        success: true,
        data: openTrades
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Manuel arbitraj işlemi başlat
  async executeManualArbitrage(req: Request, res: Response) {
    try {
      const { symbol, positionSize } = req.body;
      
      const opportunity = await this.arbitrageService.findArbitrageOpportunity(symbol);
      
      if (opportunity.action === 'NONE') {
        return res.json({
          success: false,
          message: 'No profitable arbitrage opportunity found'
        });
      }

      const result = await this.arbitrageService.executeArbitrage(
        opportunity,
        positionSize
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### 3.5 WebSocket için Real-time Updates (1 Gün)

```typescript
import WebSocket from 'ws';
import { ArbitrageService } from '../services/arbitrage.service';

export class WebSocketHandler {
  private wss: WebSocket.Server;
  private arbitrageService: ArbitrageService;
  private updateInterval: NodeJS.Timeout;

  constructor(port: number, arbitrageService: ArbitrageService) {
    this.wss = new WebSocket.Server({ port });
    this.arbitrageService = arbitrageService;
    this.setupWebSocket();
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');

      // Her 10 saniyede bir güncel verileri gönder
      const interval = setInterval(async () => {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
        const opportunities = await this.arbitrageService.scanMultipleSymbols(symbols);
        
        ws.send(JSON.stringify({
          type: 'ARBITRAGE_UPDATE',
          data: opportunities,
          timestamp: new Date()
        }));
      }, 10000);

      ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
      });
    });
  }
}
```

---

## 🎨 AŞAMA 4: Frontend Geliştirme (3-4 Gün)

### 4.1 Dashboard Komponenti

```typescript
// Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { FundingRateChart } from './FundingRateChart';
import { PositionTable } from './PositionTable';
import { useWebSocket } from '../hooks/useWebSocket';

interface ArbitrageOpportunity {
  symbol: string;
  binanceFundingRate: number;
  okxFundingRate: number;
  difference: number;
  profitability: number;
  action: string;
}

export const Dashboard: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const { data, isConnected } = useWebSocket('ws://localhost:8080');

  useEffect(() => {
    if (data && data.type === 'ARBITRAGE_UPDATE') {
      setOpportunities(data.data);
    }
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Crypto Arbitrage Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-300">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Opportunities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {opportunities.map((opp) => (
            <div key={opp.symbol} className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h3 className="text-xl font-semibold text-white mb-4">{opp.symbol}</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-300">Binance FR:</span>
                  <span className={`font-mono ${opp.binanceFundingRate > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {opp.binanceFundingRate.toFixed(4)}%
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-300">OKX FR:</span>
                  <span className={`font-mono ${opp.okxFundingRate > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {opp.okxFundingRate.toFixed(4)}%
                  </span>
                </div>
                
                <div className="flex justify-between border-t border-white/20 pt-3">
                  <span className="text-gray-300 font-semibold">Difference:</span>
                  <span className="font-mono text-yellow-400 font-bold">
                    {opp.difference.toFixed(4)}%
                  </span>
                </div>

                {opp.action !== 'NONE' && (
                  <div className="mt-4">
                    <button className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition">
                      Execute Arbitrage
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <FundingRateChart symbol="BTCUSDT" />
          <FundingRateChart symbol="ETHUSDT" />
        </div>

        {/* Positions Table */}
        <PositionTable />
      </div>
    </div>
  );
};
```

### 4.2 Funding Rate Chart Komponenti

```typescript
// FundingRateChart.tsx
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';

interface Props {
  symbol: string;
}

export const FundingRateChart: React.FC<Props> = ({ symbol }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const binanceData = await axios.get(`/api/funding-rate/history?symbol=${symbol}&exchange=binance`);
      const okxData = await axios.get(`/api/funding-rate/history?symbol=${symbol}&exchange=okx`);
      
      // Verileri birleştir ve formatla
      // ... data processing logic
      
      setData(processedData);
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Her dakika güncelle

    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
      <h3 className="text-xl font-semibold text-white mb-4">{symbol} Funding Rate History</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
          <XAxis dataKey="time" stroke="#ffffff80" />
          <YAxis stroke="#ffffff80" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1f2937', 
              border: '1px solid #374151',
              borderRadius: '8px'
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="binance" stroke="#f59e0b" strokeWidth={2} />
          <Line type="monotone" dataKey="okx" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
```

---

## 🔄 AŞAMA 5: Otomasyon ve Bot Geliştirme (2-3 Gün)

### 5.1 Otomatik Trading Bot

```typescript
// bot.service.ts
export class TradingBot {
  private arbitrageService: ArbitrageService;
  private isRunning: boolean = false;
  private config: {
    symbols: string[];
    checkInterval: number; // ms
    minProfitThreshold: number;
    maxPositionSize: number;
    autoExecute: boolean;
  };

  constructor(arbitrageService: ArbitrageService, config: any) {
    this.arbitrageService = arbitrageService;
    this.config = config;
  }

  async start() {
    this.isRunning = true;
    console.log('Trading bot started');

    while (this.isRunning) {
      try {
        // Tüm sembolleri tara
        const opportunities = await this.arbitrageService.scanMultipleSymbols(
          this.config.symbols
        );

        // Karlı fırsatları filtrele
        const profitableOpps = opportunities.filter(
          opp => opp.profitability >= this.config.minProfitThreshold
        );

        // Otomatik işlem yapma aktifse
        if (this.config.autoExecute && profitableOpps.length > 0) {
          for (const opp of profitableOpps) {
            await this.arbitrageService.executeArbitrage(
              opp,
              this.config.maxPositionSize
            );
          }
        }

        // Bekleme süresi
        await this.sleep(this.config.checkInterval);

      } catch (error) {
        console.error('Bot error:', error);
        await this.sleep(5000); // Hata durumunda 5 saniye bekle
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log('Trading bot stopped');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 5.2 Risk Yönetimi

```typescript
// risk.service.ts
export class RiskManagementService {
  private maxDailyLoss: number;
  private maxPositionSize: number;
  private currentDailyLoss: number = 0;

  constructor(maxDailyLoss: number, maxPositionSize: number) {
    this.maxDailyLoss = maxDailyLoss;
    this.maxPositionSize = maxPositionSize;
  }

  // Pozisyon açmadan önce risk kontrolü
  canOpenPosition(positionSize: number, expectedProfit: number): boolean {
    // Maksimum pozisyon boyutu kontrolü
    if (positionSize > this.maxPositionSize) {
      return false;
    }

    // Günlük zarar limiti kontrolü
    if (this.currentDailyLoss >= this.maxDailyLoss) {
      return false;
    }

    return true;
  }

  // Günlük zarar/kar güncelleme
  updateDailyPnL(pnl: number) {
    if (pnl < 0) {
      this.currentDailyLoss += Math.abs(pnl);
    }
  }

  // Günlük reset (her gün başında çağrılmalı)
  resetDaily() {
    this.currentDailyLoss = 0;
  }
}
```

---

## 🧪 AŞAMA 6: Test ve Debugging (2-3 Gün)

### 6.1 Unit Testler

```typescript
// arbitrage.service.test.ts
import { ArbitrageService } from '../services/arbitrage.service';

describe('ArbitrageService', () => {
  let service: ArbitrageService;

  beforeEach(() => {
    // Mock services
    const mockBinance = {
      getCurrentFundingRate: jest.fn()
    };
    const mockOKX = {
      getCurrentFundingRate: jest.fn()
    };

    service = new ArbitrageService(mockBinance, mockOKX, 0.05);
  });

  test('should find arbitrage opportunity when difference > threshold', async () => {
    // Test implementation
  });

  test('should not execute when difference < threshold', async () => {
    // Test implementation
  });
});
```

### 6.2 Testnet'te Test Etme

1. Binance Testnet API kullan: `https://testnet.binancefuture.com`
2. OKX Demo Trading kullan
3. Gerçek para ile test etmeden önce en az 1 hafta testnet'te çalıştır

---

## 🚀 AŞAMA 7: Deployment (2 Gün)

### 7.1 Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/arbitrage
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine

volumes:
  mongo-data:
```

### 7.2 Production Deployment

1. VPS/Cloud Server kiralama (DigitalOcean, AWS, Hetzner)
2. Docker ve Docker Compose kurulumu
3. SSL sertifikası (Let's Encrypt)
4. Nginx reverse proxy konfigürasyonu
5. PM2 ile process management
6. Monitoring (Grafana, Prometheus)

---

## 📊 AŞAMA 8: Monitoring ve Optimization (Sürekli)

### 8.1 Logging

```typescript
// logger.ts
import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor(service: string) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service },
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  error(message: string, error?: any) {
    this.logger.error(message, { error: error?.message, stack: error?.stack });
  }
}
```

### 8.2 Performance Monitoring

- API response time tracking
- Database query optimization
- WebSocket connection monitoring
- Memory usage tracking

---

## ⚠️ ÖNEMLİ NOTLAR VE RİSKLER

### Güvenlik
1. **API Keys**: Asla GitHub'a commit etmeyin, environment variables kullanın
2. **IP Whitelist**: API key'leri sadece belirli IP'lerden erişilebilir yapın
3. **Rate Limiting**: API rate limit'lerini aşmamaya dikkat edin
4. **2FA**: Tüm exchange hesaplarında 2FA aktif olmalı

### Finansal Riskler
1. **Slippage**: Market order'larda fiyat kayması olabilir
2. **Funding Rate Değişimi**: Pozisyon açtıktan sonra funding rate değişebilir
3. **Likidite**: Düşük likidite'de pozisyon kapatmak zor olabilir
4. **Network Latency**: API gecikmeleri arbitraj fırsatını kaçırabilir

### Teknik Riskler
1. **API Downtime**: Exchange API'leri çökebilir
2. **WebSocket Disconnection**: Bağlantı kopması durumunda reconnect mekanizması
3. **Database Failure**: Backup stratejisi olmalı
4. **Rate Limits**: Her exchange'in farklı rate limit'leri var

---

## 📈 GELİŞTİRME ZAMANLAMA

| Aşama | Süre | Açıklama |
|-------|------|----------|
| 1. Araştırma | 1-2 gün | API docs, teknoloji seçimi |
| 2. Proje Yapısı | 1 gün | Klasör yapısı, paket kurulumu |
| 3. Backend | 5-7 gün | Services, API, WebSocket |
| 4. Frontend | 3-4 gün | Dashboard, charts, UI |
| 5. Otomasyon | 2-3 gün | Trading bot, risk yönetimi |
| 6. Test | 2-3 gün | Unit test, testnet |
| 7. Deployment | 2 gün | Docker, production setup |
| **TOPLAM** | **16-22 gün** | Tam zamanlı çalışma varsayımı |

---

## 🎯 İLK ADIMLAR (Bugün Başlayabilirsiniz)

1. ✅ Binance ve OKX'te API key oluşturun
2. ✅ Node.js ve TypeScript kurulumunu yapın
3. ✅ Proje klasör yapısını oluşturun
4. ✅ Binance ve OKX service'lerini yazın
5. ✅ Basit bir test scripti ile funding rate'leri çekin
6. ✅ Console'da arbitraj fırsatlarını görüntüleyin

---

## 📚 Ek Kaynaklar

- [Binance Futures API Docs](https://binance-docs.github.io/apidocs/futures/en/)
- [OKX API Docs](https://www.okx.com/docs-v5/en/)
- [CCXT Library](https://github.com/ccxt/ccxt) - Alternatif exchange library
- [TradingView](https://www.tradingview.com/) - Funding rate analizi için

---

Bu plan, production-ready bir arbitraj sistemi kurmanız için gereken tüm adımları içeriyor. Sorularınız olursa çekinmeden sorun!
