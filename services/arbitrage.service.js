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
            binance: '/logos/binance.png',
            okx: '/logos/okx.png',
            hyperliquid: '/logos/hyperliquid.png'
        };
        return logos[slug] || '';
    }

    // En büyük coinler (Binance, OKX ve Hyperliquid'de ortak olanlar)
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
            // YENİ EKLENEN COINLER
            {
                binance: 'LTCUSDT',
                okx: 'LTC-USDT-SWAP',
                hyperliquid: 'LTC',
                name: 'Litecoin',
                symbol: 'LTC',
                logo: 'https://cryptologos.cc/logos/litecoin-ltc-logo.png',
                color: '#345D9D'
            },
            {
                binance: 'LINKUSDT',
                okx: 'LINK-USDT-SWAP',
                hyperliquid: 'LINK',
                name: 'Chainlink',
                symbol: 'LINK',
                logo: 'https://cryptologos.cc/logos/chainlink-link-logo.png',
                color: '#2A5ADA'
            },
            {
                binance: 'BCHUSDT',
                okx: 'BCH-USDT-SWAP',
                hyperliquid: 'BCH',
                name: 'Bitcoin Cash',
                symbol: 'BCH',
                logo: 'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png',
                color: '#0AC18E'
            },
            {
                binance: 'ATOMUSDT',
                okx: 'ATOM-USDT-SWAP',
                hyperliquid: 'ATOM',
                name: 'Cosmos',
                symbol: 'ATOM',
                logo: 'https://cryptologos.cc/logos/cosmos-atom-logo.png',
                color: '#2E3148'
            },
            {
                binance: 'NEARUSDT',
                okx: 'NEAR-USDT-SWAP',
                hyperliquid: 'NEAR',
                name: 'NEAR Protocol',
                symbol: 'NEAR',
                logo: 'https://cryptologos.cc/logos/near-protocol-near-logo.png',
                color: '#000000'
            },
            {
                binance: 'UNIUSDT',
                okx: 'UNI-USDT-SWAP',
                hyperliquid: 'UNI',
                name: 'Uniswap',
                symbol: 'UNI',
                logo: 'https://cryptologos.cc/logos/uniswap-uni-logo.png',
                color: '#FF007A'
            },
            {
                binance: 'FILUSDT',
                okx: 'FIL-USDT-SWAP',
                hyperliquid: 'FIL',
                name: 'Filecoin',
                symbol: 'FIL',
                logo: 'https://cryptologos.cc/logos/filecoin-fil-logo.png',
                color: '#0090FF'
            },
            {
                binance: 'APTUSDT',
                okx: 'APT-USDT-SWAP',
                hyperliquid: 'APT',
                name: 'Aptos',
                symbol: 'APT',
                logo: 'https://cryptologos.cc/logos/aptos-apt-logo.png',
                color: '#000000'
            },
            {
                binance: 'SUIUSDT',
                okx: 'SUI-USDT-SWAP',
                hyperliquid: 'SUI',
                name: 'Sui',
                symbol: 'SUI',
                logo: 'https://cryptologos.cc/logos/sui-sui-logo.png',
                color: '#4DA2FF'
            },
            {
                binance: 'ARBUSDT',
                okx: 'ARB-USDT-SWAP',
                hyperliquid: 'ARB',
                name: 'Arbitrum',
                symbol: 'ARB',
                logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
                color: '#2D374B'
            }
        ];
    }
}

module.exports = ArbitrageService;
