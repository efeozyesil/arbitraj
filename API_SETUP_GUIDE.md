# 🔑 API Key Setup Guide

Bu rehber, Binance ve OKX'ten API key'lerinizi nasıl alacağınızı adım adım gösterir.

## 📝 Binance API Key Oluşturma

### 1. Binance Futures Hesabınıza Giriş Yapın
- [Binance Futures](https://www.binance.com/en/futures) adresine gidin
- Hesabınıza giriş yapın

### 2. API Management Sayfasına Gidin
- Sağ üstteki profil ikonuna tıklayın
- **API Management** seçeneğini seçin

### 3. Yeni API Key Oluşturun
- **Create API** butonuna tıklayın
- API key'e bir isim verin (örn: "Arbitrage Bot")
- 2FA doğrulamasını tamamlayın

### 4. İzinleri Ayarlayın
Sadece şu izinleri aktif edin:
- ✅ **Enable Reading** (Okuma izni)
- ✅ **Enable Futures** (Futures işlemleri)
- ❌ **Enable Spot & Margin Trading** (Gerekli değil)
- ❌ **Enable Withdrawals** (GÜVENLİK için kapalı tutun!)

### 5. IP Whitelist Ekleyin (Önerilen)
- **Restrict access to trusted IPs only** seçeneğini işaretleyin
- Sunucunuzun IP adresini ekleyin
- Yerel test için: `127.0.0.1` ekleyin

### 6. API Key ve Secret'ı Kaydedin
- ⚠️ **API Secret sadece bir kez gösterilir!**
- API Key ve Secret'ı güvenli bir yere kaydedin
- `.env` dosyanıza ekleyin

---

## 🌐 OKX API Key Oluşturma

### 1. OKX Hesabınıza Giriş Yapın
- [OKX](https://www.okx.com) adresine gidin
- Hesabınıza giriş yapın

### 2. API Management Sayfasına Gidin
- Sağ üstteki profil ikonuna tıklayın
- **API** seçeneğini seçin
- **Create V5 API Key** butonuna tıklayın

### 3. API Key Bilgilerini Girin
- **API Key Name**: "Arbitrage Bot" gibi bir isim verin
- **Passphrase**: Güçlü bir şifre belirleyin (bunu unutmayın!)
- 2FA doğrulamasını tamamlayın

### 4. İzinleri Ayarlayın
Sadece şu izinleri aktif edin:
- ✅ **Read** (Okuma izni)
- ✅ **Trade** (İşlem izni - sadece futures için)
- ❌ **Withdraw** (GÜVENLİK için kapalı tutun!)

### 5. IP Whitelist Ekleyin (Önerilen)
- **Link IP addresses** seçeneğini işaretleyin
- Sunucunuzun IP adresini ekleyin
- Yerel test için: `127.0.0.1` ekleyin

### 6. API Key, Secret ve Passphrase'i Kaydedin
- ⚠️ **API Secret ve Passphrase sadece bir kez gösterilir!**
- API Key, Secret ve Passphrase'i güvenli bir yere kaydedin
- `.env` dosyanıza ekleyin

---

## 📋 .env Dosyasını Düzenleme

`.env` dosyasını bir metin editörü ile açın ve API key'lerinizi ekleyin:

```env
# Binance API Keys
BINANCE_API_KEY=buraya_binance_api_key_ekleyin
BINANCE_API_SECRET=buraya_binance_api_secret_ekleyin

# OKX API Keys
OKX_API_KEY=buraya_okx_api_key_ekleyin
OKX_API_SECRET=buraya_okx_api_secret_ekleyin
OKX_PASSPHRASE=buraya_okx_passphrase_ekleyin

# Server Configuration
PORT=3000
WS_PORT=8080
```

### Örnek (Gerçek değil!):
```env
BINANCE_API_KEY=abc123xyz789def456ghi012jkl345mno678pqr901stu234vwx567
BINANCE_API_SECRET=xyz789abc123def456ghi012jkl345mno678pqr901stu234vwx567

OKX_API_KEY=12345678-abcd-1234-efgh-123456789012
OKX_API_SECRET=ABCD1234EFGH5678IJKL9012MNOP3456
OKX_PASSPHRASE=MyStrongPassphrase123!
```

---

## ✅ API Bağlantısını Test Etme

API key'lerinizi ekledikten sonra test edin:

```bash
npm run test-api
```

### Başarılı Test Çıktısı:
```
🧪 Testing API Connections...

📊 Testing Binance API...
✅ Binance API working!
   BTC Mark Price: $43,250.50
   Funding Rate: 0.0100%

📊 Testing OKX API...
✅ OKX API working!
   BTC Mark Price: $43,248.75
   Funding Rate: 0.0095%

═══════════════════════════════════════
✅ All tests passed! You can now run: npm start
═══════════════════════════════════════
```

### Hata Alırsanız:
- API key'lerin doğru kopyalandığından emin olun
- Boşluk veya satır sonu karakteri olmadığını kontrol edin
- İzinlerin doğru ayarlandığını kontrol edin
- IP whitelist'e IP adresinizi eklediğinizden emin olun

---

## 🔒 Güvenlik Önerileri

### ✅ YAPILMASI GEREKENLER:
1. **IP Whitelist kullanın** - Sadece güvendiğiniz IP'lerden erişim
2. **Minimum izinler** - Sadece gerekli izinleri verin
3. **Withdraw kapalı** - Asla withdraw izni vermeyin
4. **Güçlü passphrase** - OKX için güçlü bir şifre kullanın
5. **2FA aktif** - Her iki borsada da 2FA aktif olmalı

### ❌ YAPILMAMASI GEREKENLER:
1. **API key'leri paylaşmayın** - Kimseyle paylaşmayın
2. **GitHub'a yüklemeyin** - `.env` dosyası `.gitignore`'da
3. **Screenshot almayın** - Ekran görüntüsü almayın
4. **Public yerlerde kullanmayın** - Kafelerde dikkatli olun

---

## 🚀 Hazırsınız!

API key'lerinizi ekledikten ve test ettikten sonra:

```bash
npm start
```

Dashboard'u açın:
```
http://localhost:3000
```

Enjoy! 🎉
