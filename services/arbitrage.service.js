class ArbitrageService {
    /**
     * @param {Object} exchangeWS_A - Birinci borsa WebSocket servisi
     * @param {Object} exchangeWS_B - İkinci borsa WebSocket servisi
     * @param {string} slugA - Birinci borsa slug (örn: 'binance')
     * @param {string} slugB - İkinci borsa slug (örn: 'okx')
     * @param {string} nameA - Birinci borsa görünen adı
     * @param {string} nameB - İkinci borsa görünen adı
     */
    constructor(exchangeWS_A, exchangeWS_B, slugA, slugB, nameA, nameB) {
        this.wsA = exchangeWS_A;
        this.wsB = exchangeWS_B;
        this.slugA = slugA;
        this.slugB = slugB;
        this.nameA = nameA;
        this.nameB = nameB;

        // İşlem ücretleri (Maker/Taker) - Şimdilik 0
        this.fees = {
            exchangeA: { maker: 0.0000, taker: 0.0000 },
            exchangeB: { maker: 0.0000, taker: 0.0000 }
        };
    }

    getArbitrageOpportunities() {
        try {
            const topCoins = this.getTopCoins();
            const opportunities = [];

            topCoins.forEach(coin => {
                const symbolA = coin[this.slugA];
                const symbolB = coin[this.slugB];

                // WebSocket cache'den veriyi al
                const dataA = this.wsA.getData(symbolA);
                const dataB = this.wsB.getData(symbolB);

                if (!dataA || !dataB) {
                    // Veri henüz gelmediyse atla
                    // Spam önlemek için sadece %1 ihtimalle log bas
                    if (Math.random() < 0.01) {
                        if (!dataA) console.warn(`[${this.nameA}] Missing data for ${symbolA}`);
                        if (!dataB) console.warn(`[${this.nameB}] Missing data for ${symbolB}`);
                    }
                    return;
                }

                // Fiyat ve Funding Rate farklarını hesapla
                // Not: WS verisinde bid/ask olmayabilir (özellikle Binance mark price stream'inde).
                // Bu yüzden mark price üzerinden hesaplama yapacağız.

                const fundingDiff = dataB.fundingRate - dataA.fundingRate;

                // Arbitraj Analizi
                const analysis = this.analyzeArbitrage(
                    dataA.markPrice, dataB.markPrice,
                    dataA.markPrice, dataA.markPrice, // Bid/Ask yoksa Mark kullan
                    dataB.markPrice, dataB.markPrice,
                    dataA.fundingRate, dataB.fundingRate
                );

                opportunities.push({
                    symbol: coin.symbol,
                    name: coin.name,
                    logo: coin.logo,
                    color: coin.color,
                    exchangeA: {
                        name: this.nameA,
                        logo: this.getExchangeLogo(this.slugA),
                        markPrice: dataA.markPrice,
                        bidPrice: dataA.markPrice,
                        askPrice: dataA.markPrice,
                        fundingRate: dataA.fundingRate,
                        nextFundingTime: dataA.nextFundingTime
                    },
                    exchangeB: {
                        name: this.nameB,
                        logo: this.getExchangeLogo(this.slugB),
                        markPrice: dataB.markPrice,
                        bidPrice: dataB.markPrice,
                        askPrice: dataB.markPrice,
                        fundingRate: dataB.fundingRate,
                        nextFundingTime: dataB.nextFundingTime
                    },
                    analysis: analysis
                });
            });

            // Kârlılığa göre sırala
            return opportunities.sort((a, b) => b.analysis.profitability8hNet - a.analysis.profitability8hNet);

        } catch (error) {
            console.error(`[${this.nameA}-${this.nameB}] Arbitrage calculation error:`, error.message);
            return [];
        }
    }

    analyzeArbitrage(markA, markB, bidA, askA, bidB, askB, fundingA, fundingB) {
        // Strateji 1: A'da Long, B'de Short (Funding A < Funding B)
        // A shortlanınca funding öder/alır, B longlanınca funding öder/alır.

        const fundingDiff = fundingB - fundingA; // Pozitifse B Short / A Long avantajlı

        let strategy = '';
        let netFundingIncome = 0;
        let entryCost = 0;
        let exitCost = 0;

        // İşlem ücretleri (Taker giriş, Taker çıkış varsayımı)
        const totalFeeRate = this.fees.exchangeA.taker + this.fees.exchangeB.taker;

        if (fundingDiff > 0) {
            // Strateji: Long A, Short B
            strategy = 'LONG_A_SHORT_B';
            netFundingIncome = fundingDiff;

            // Giriş Maliyeti: A'dan al (Ask), B'ye sat (Bid)
            // Fiyat farkı zararı (Spread) + Komisyonlar
            const priceSpreadLoss = ((askA - bidB) / askA) * 100;
            entryCost = priceSpreadLoss + (totalFeeRate * 100);

        } else {
            // Strateji: Short A, Long B
            strategy = 'SHORT_A_LONG_B';
            netFundingIncome = -fundingDiff; // A - B pozitif olur

            // Giriş Maliyeti: B'den al (Ask), A'ya sat (Bid)
            const priceSpreadLoss = ((askB - bidA) / askB) * 100;
            entryCost = priceSpreadLoss + (totalFeeRate * 100);
        }

        // Çıkış maliyeti (Pozisyon kapatma) - Girişle benzer varsayılır
        exitCost = entryCost;

        // Net Kârlılık (8 saatlik periyot için)
        const profitability8hNet = netFundingIncome - entryCost - exitCost;

        // Yıllıklandırılmış Getiri (Basit faiz)
        const annualReturnNet = profitability8hNet * 3 * 365;

        // Fırsat mı? (Eşik değer: %0.01 net kâr)
        const isOpportunity = profitability8hNet > 0.001;

        return {
            strategy,
            fundingDifference: fundingDiff,
            netFundingIncome,
            entryCost,
            exitCost,
            profitability8hNet,
            annualReturnNet,
            isOpportunity
        };
    }

    getExchangeLogo(slug) {
        const logos = {
            binance: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Binance_Logo.png',
            okx: 'https://cryptologos.cc/logos/okx-okb-logo.png',
            hyperliquid: 'https://raw.githubusercontent.com/hyperliquid-dex/brand-assets/main/logo.png'
        };
        // Fallback for Hyperliquid if the above fails: https://icons.llamao.fi/icons/protocols/hyperliquid?w=48&h=48
        return logos[slug] || '';
    }

    getTopCoins() {
        return [
            {
                binance: 'BTCUSDT',
                okx: 'BTC-USDT-SWAP',
                hyperliquid: 'BTC',
                name: 'Bitcoin',
                symbol: 'BTC',
                logo: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
                color: '#F7931A'
            },
            {
                binance: 'ETHUSDT',
                okx: 'ETH-USDT-SWAP',
                hyperliquid: 'ETH',
                name: 'Ethereum',
                symbol: 'ETH',
                logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
                color: '#627EEA'
            },
            {
                binance: 'BNBUSDT',
                okx: 'BNB-USDT-SWAP',
                hyperliquid: 'BNB',
                name: 'BNB',
                symbol: 'BNB',
                logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
                color: '#F3BA2F'
            },
            {
                binance: 'SOLUSDT',
                okx: 'SOL-USDT-SWAP',
                hyperliquid: 'SOL',
                name: 'Solana',
                symbol: 'SOL',
                logo: 'https://cryptologos.cc/logos/solana-sol-logo.png',
                color: '#14F195'
            },
            {
                binance: 'XRPUSDT',
                okx: 'XRP-USDT-SWAP',
                hyperliquid: 'XRP',
                name: 'Ripple',
                symbol: 'XRP',
                logo: 'https://cryptologos.cc/logos/xrp-xrp-logo.png',
                color: '#23292F'
            },
            {
                binance: 'ADAUSDT',
                okx: 'ADA-USDT-SWAP',
                hyperliquid: 'ADA',
                name: 'Cardano',
                symbol: 'ADA',
                logo: 'https://cryptologos.cc/logos/cardano-ada-logo.png',
                color: '#0033AD'
            },
            {
                binance: 'DOGEUSDT',
                okx: 'DOGE-USDT-SWAP',
                hyperliquid: 'DOGE',
                name: 'Dogecoin',
                symbol: 'DOGE',
                logo: 'https://cryptologos.cc/logos/dogecoin-doge-logo.png',
                color: '#C2A633'
            },
            {
                binance: 'AVAXUSDT',
                okx: 'AVAX-USDT-SWAP',
                hyperliquid: 'AVAX',
                name: 'Avalanche',
                symbol: 'AVAX',
                logo: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
                color: '#E84142'
            },
            {
                binance: 'DOTUSDT',
                okx: 'DOT-USDT-SWAP',
                hyperliquid: 'DOT',
                name: 'Polkadot',
                symbol: 'DOT',
                logo: 'https://cryptologos.cc/logos/polkadot-new-dot-logo.png',
                color: '#E6007A'
            },
            {
                binance: 'MATICUSDT',
                okx: 'MATIC-USDT-SWAP',
                hyperliquid: 'POL', // MATIC -> POL (Polygon 2.0)
                name: 'Polygon',
                symbol: 'MATIC',
                logo: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
                color: '#8247E5'
            }
        ];
    }
}

module.exports = ArbitrageService;
