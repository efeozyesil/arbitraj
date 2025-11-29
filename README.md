# 🚀 Crypto Arbitrage Dashboard - Binance vs OKX

Modern ve premium bir arbitraj dashboard'u ile Binance ve OKX borsaları arasındaki funding rate farklarını gerçek zamanlı takip edin!

## ✨ Özellikler

- 📊 **Real-time Data**: WebSocket ile anlık veri güncellemeleri
- 💰 **Top 10 Coins**: En büyük 10 kripto para için funding rate ve fiyat takibi
- 🎯 **Arbitraj Fırsatları**: Otomatik arbitraj fırsatı tespiti
- 🎨 **Premium UI**: Modern glassmorphism tasarım
- ⚡ **Hızlı**: Her 15 saniyede bir otomatik güncelleme
- 📱 **Responsive**: Mobil ve desktop uyumlu

## 🛠️ Kurulum

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. API Key'leri Ayarlayın

`.env` dosyası oluşturun (`.env.example` dosyasını kopyalayın):

```bash
cp .env.example .env
```

Sonra `.env` dosyasını düzenleyip API key'lerinizi ekleyin:

```env
# Binance API Keys
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here

# OKX API Keys
OKX_API_KEY=your_okx_api_key_here
OKX_API_SECRET=your_okx_api_secret_here
OKX_PASSPHRASE=your_okx_passphrase_here

# Server Configuration
PORT=3000
WS_PORT=8080
```

### 3. Sunucuyu Başlatın

```bash
npm start
```

### 4. Dashboard'u Açın

Tarayıcınızda şu adresi açın:
```
http://localhost:3000
```

## 📊 Takip Edilen Coinler

1. Bitcoin (BTC)
2. Ethereum (ETH)
3. BNB (BNB)
4. Solana (SOL)
5. Ripple (XRP)
6. Cardano (ADA)
7. Dogecoin (DOGE)
8. Avalanche (AVAX)
9. Polkadot (DOT)
10. Polygon (MATIC)

## 🔌 API Endpoints

### REST API

- `GET /api/opportunities` - Tüm arbitraj fırsatlarını getir
- `GET /api/health` - Sistem durumunu kontrol et

### WebSocket

- `ws://localhost:8080` - Real-time arbitraj güncellemeleri

## 📈 Nasıl Çalışır?

1. **Veri Toplama**: Her 15 saniyede bir Binance ve OKX'ten funding rate ve fiyat verileri çekilir
2. **Analiz**: Her coin için funding rate farkları hesaplanır
3. **Fırsat Tespiti**: %0.01'den büyük farklar arbitraj fırsatı olarak işaretlenir
4. **Strateji Önerisi**: Hangi borsada LONG, hangisinde SHORT pozisyon açılacağı belirlenir
5. **Dashboard**: Tüm veriler modern bir arayüzde görselleştirilir

## 🎯 Arbitraj Stratejisi

### Binance Funding Rate > OKX Funding Rate
- **Strateji**: Binance'de SHORT, OKX'te LONG
- **Mantık**: Binance'de funding fee alırsınız, OKX'te ödersiniz

### OKX Funding Rate > Binance Funding Rate
- **Strateji**: Binance'de LONG, OKX'te SHORT
- **Mantık**: OKX'te funding fee alırsınız, Binance'de ödersiniz

## ⚠️ Önemli Notlar

### Güvenlik
- ✅ API key'lerinizi asla GitHub'a commit etmeyin
- ✅ `.env` dosyası `.gitignore`'da bulunuyor
- ✅ API key'lere IP whitelist ekleyin
- ✅ Sadece gerekli izinleri verin (Read Info, Enable Futures)

### Risk Yönetimi
- ⚠️ Bu dashboard sadece bilgilendirme amaçlıdır
- ⚠️ Gerçek işlem yapmadan önce testnet'te deneyin
- ⚠️ Slippage ve likidite risklerini göz önünde bulundurun
- ⚠️ Funding rate'ler pozisyon açtıktan sonra değişebilir

## 🔧 Geliştirme

### Proje Yapısı

```
metallic-cosmic/
├── services/
│   ├── binance.service.js    # Binance API entegrasyonu
│   ├── okx.service.js         # OKX API entegrasyonu
│   └── arbitrage.service.js   # Arbitraj mantığı
├── public/
│   └── index.html             # Dashboard UI
├── server.js                  # Express + WebSocket server
├── .env                       # API keys (git'e eklenmez)
├── .env.example               # Örnek env dosyası
└── package.json
```

### Teknolojiler

- **Backend**: Node.js, Express.js
- **WebSocket**: ws library
- **HTTP Client**: axios
- **Frontend**: Vanilla JavaScript, CSS3
- **Design**: Glassmorphism, Gradient animations

## 📝 Lisans

MIT

## 🤝 Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır!

## 📞 Destek

Sorularınız için issue açabilirsiniz.

---

**Not**: Bu proje eğitim amaçlıdır. Gerçek para ile işlem yapmadan önce riskleri anlayın ve testnet'te test edin.
