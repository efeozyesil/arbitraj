# AWS Deployment Guide (AWS Dağıtım Rehberi)

Bu rehber, Crypto Arbitrage Dashboard projesini AWS EC2 üzerine taşıyarak 7/24 çalışır hale getirmek için gerekli adımları içerir.

## 1. Hazırlık (Local Bilgisayarınızda)

Öncelikle projenizi GitHub'a yüklemeniz gerekmektedir. Bu, kodunuzu sunucuya aktarmanın en güvenli ve kolay yoludur.

1.  GitHub'da (github.com) yeni bir **Private (Gizli)** repository oluşturun.
2.  Terminalden projenizi bu repository'ye gönderin:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin <GITHUB_REPO_URL>
    git push -u origin main
    ```

## 2. AWS EC2 Sunucusu Oluşturma

1.  **AWS Konsolu**'na giriş yapın ve **EC2** servisini aratıp açın.
2.  **Launch Instance** (Sunucu Başlat) butonuna tıklayın.
3.  **Name:** `CryptoArbitrageServer` gibi bir isim verin.
4.  **OS Images:** `Ubuntu` seçin (Ubuntu Server 22.04 LTS veya 24.04 LTS uygundur).
5.  **Instance Type:** `t2.micro` veya `t3.micro` seçin (Free Tier kapsamında ücretsizdir).
6.  **Key Pair:** `Create new key pair` deyin, bir isim verin (örn: `aws-key`) ve indirin. **Bu `.pem` dosyasını sakın kaybetmeyin!**
7.  **Network Settings:**
    *   `Allow SSH traffic from` -> `My IP` (Güvenlik için sadece kendi IP'nizden erişim verin).
    *   `Allow HTTP traffic from the internet` kutucuğunu işaretleyin.
8.  **Launch Instance** butonuna basarak sunucuyu başlatın.

## 3. Güvenlik Ayarları (Port Açma)

Uygulamamız 3000 (Web) ve 8080 (WebSocket) portlarını kullanıyor. Bunları dışarıya açmalıyız.

1.  EC2 paneline dönün, oluşturduğunuz instance'ı seçin.
2.  Alt kısımdaki **Security** sekmesine tıklayın ve **Security Groups** linkine gidin.
3.  **Edit inbound rules** butonuna tıklayın.
4.  Aşağıdaki kuralları ekleyin:
    *   **Type:** `Custom TCP`, **Port:** `3000`, **Source:** `Anywhere-IPv4` (0.0.0.0/0)
    *   **Type:** `Custom TCP`, **Port:** `8080`, **Source:** `Anywhere-IPv4` (0.0.0.0/0)
5.  **Save rules** diyerek kaydedin.

## 4. Sunucuya Bağlanma

Terminalinizi açın ve indirdiğiniz `.pem` dosyasının olduğu klasöre gidin.

```bash
# Anahtar dosyasının izinlerini ayarlayın (sadece bir kez)
chmod 400 aws-key.pem

# Sunucuya bağlanın (Public IPv4 adresini EC2 panelinden kopyalayın)
ssh -i "aws-key.pem" ubuntu@<SUNUCU_IP_ADRESI>
```

## 5. Sunucu Kurulumu

Sunucuya bağlandıktan sonra sırasıyla şu komutları çalıştırın:

```bash
# Sistemi güncelleyin
sudo apt update && sudo apt upgrade -y

# Node.js kurulumu (v18)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Git ve PM2 (Process Manager) kurulumu
sudo apt install -y git
sudo npm install -g pm2
```

## 6. Projeyi Çekme ve Çalıştırma

```bash
# Projeyi GitHub'dan çekin (GitHub kullanıcı adı ve şifre/token sorabilir)
git clone <GITHUB_REPO_URL>
cd metallic-cosmic

# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun
nano .env
# (Localdeki .env içeriğinizi buraya yapıştırın ve Ctrl+X, Y, Enter ile kaydedin)

# Uygulamayı PM2 ile başlatın (Arka planda sürekli çalışması için)
pm2 start server.js --name "crypto-bot"

# Başlangıçta otomatik çalışması için ayarla
pm2 startup
pm2 save
```

## 7. Tebrikler! 🎉

Artık tarayıcınızdan `http://<SUNUCU_IP_ADRESI>:3000` adresine giderek uygulamanızı görebilirsiniz. Bilgisayarınızı kapatsanız bile bot 7/24 çalışmaya devam edecektir.
