class ArbitrageService {
    /**
     * @param {Object} serviceA - Birinci borsa servisi (örn: BinanceService)
     * @param {Object} serviceB - İkinci borsa servisi (örn: OKXService)
     * @param {string} slugA - Birinci borsa için coin objesindeki anahtar (örn: 'binance')
     * @param {string} slugB - İkinci borsa için coin objesindeki anahtar (örn: 'okx')
     * @param {string} nameA - Birinci borsanın görünen adı (örn: 'Binance')
     * @param {string} nameB - İkinci borsanın görünen adı (örn: 'OKX')
     */
    constructor(serviceA, serviceB, slugA = 'binance', slugB = 'okx', nameA = 'Binance', nameB = 'OKX') {
        this.exchangeA = serviceA;
        this.exchangeB = serviceB;
        this.slugA = slugA;
        this.slugB = slugB;
        this.nameA = nameA;
        this.nameB = nameB;

        // Trading fees (taker fees for market orders)
        // TEMPORARILY SET TO 0 FOR TESTING
        this.fees = {
            exchangeA: {
                maker: 0.00,
                taker: 0.00
            },
            exchangeB: {
                maker: 0.00,
                taker: 0.00
            }
        };
    }

    // Yıllık getiri hesaplama (Basit faiz: Getiri * 3 günde 1 * 365)
    // Funding rate 8 saatlik olduğu için günde 3 ödeme var
    calculateAnnualReturn(ratePerPeriod) {
        return ratePerPeriod * 3 * 365;
    }

    // Detaylı işlem adımları oluştur
    generateTradingSteps(strategy, coin, rateA, rateB) {
        const steps = [];

        if (strategy === 'SHORT_A_LONG_B') {
            // A Borsası SHORT, B Borsası LONG
            steps.push({
                step: 1,
                exchange: this.nameA,
                side: 'SHORT',
                description: `Open Short position on ${this.nameA}`,
                fee: this.fees.exchangeA.taker,
                fundingReceive: rateA > 0 ? `Earns Funding (${rateA.toFixed(4)}%)` : null,
                fundingPay: rateA < 0 ? `Pays Funding (${Math.abs(rateA).toFixed(4)}%)` : null
            });
            steps.push({
                step: 2,
                exchange: this.nameB,
                side: 'LONG',
                description: `Open Long position on ${this.nameB}`,
                fee: this.fees.exchangeB.taker,
                fundingReceive: rateB < 0 ? `Earns Funding (${Math.abs(rateB).toFixed(4)}%)` : null,
                fundingPay: rateB > 0 ? `Pays Funding (${rateB.toFixed(4)}%)` : null
            });
        } else if (strategy === 'LONG_A_SHORT_B') {
            // A Borsası LONG, B Borsası SHORT
            steps.push({
                step: 1,
                exchange: this.nameA,
                side: 'LONG',
                description: `Open Long position on ${this.nameA}`,
                fee: this.fees.exchangeA.taker,
                fundingReceive: rateA < 0 ? `Earns Funding (${Math.abs(rateA).toFixed(4)}%)` : null,
                fundingPay: rateA > 0 ? `Pays Funding (${rateA.toFixed(4)}%)` : null
            });
            steps.push({
                step: 2,
                exchange: this.nameB,
                side: 'SHORT',
                description: `Open Short position on ${this.nameB}`,
                fee: this.fees.exchangeB.taker,
                fundingReceive: rateB > 0 ? `Earns Funding (${rateB.toFixed(4)}%)` : null,
                fundingPay: rateB < 0 ? `Pays Funding (${Math.abs(rateB).toFixed(4)}%)` : null
            });
        }

        return steps;
    }

    // Her iki borsadan da veri çek ve karşılaştır
    async getArbitrageOpportunities() {
        const topCoins = this.getTopCoins();

        try {
            // Borsa A verilerini çek
            // Hangi metodu çağıracağımızı belirle (Binance ve OKX/Hyperliquid metod isimleri farklı olabilir, 
            // ama servislerde ortak bir arayüz kullanmaya çalıştık. 
            // Binance: getMultiplePremiumIndex, OKX: getMultipleFundingData, Hyperliquid: getMultipleFundingData)

            // Sembolleri al
            const symbolsA = topCoins.map(c => c[this.slugA]).filter(s => s);
            const symbolsB = topCoins.map(c => c[this.slugB]).filter(s => s);

            // Verileri çek
            // Not: Servislerin metod isimlerini standartlaştırmak en iyisi olurdu ama şimdilik check ediyoruz
            let dataA, dataB;

            if (this.slugA === 'binance') {
                dataA = await this.exchangeA.getMultiplePremiumIndex(symbolsA);
            } else {
                dataA = await this.exchangeA.getMultipleFundingData(symbolsA);
            }

            if (this.slugB === 'binance') {
                dataB = await this.exchangeB.getMultiplePremiumIndex(symbolsB);
            } else {
                dataB = await this.exchangeB.getMultipleFundingData(symbolsB);
            }

            // Verileri birleştir ve arbitraj fırsatlarını hesapla
            const opportunities = topCoins.map(coin => {
                const symbolA = coin[this.slugA];
                const symbolB = coin[this.slugB];

                if (!symbolA || !symbolB) return null;

                const infoA = dataA.find(d => d.symbol === symbolA);
                const infoB = dataB.find(d => d.symbol === symbolB);

                if (!infoA || !infoB) {
                    return null;
                }

                const fundingDiff = infoA.lastFundingRate - infoB.lastFundingRate;

                // STRATEJI: Sadece funding rate farkına göre belirle
                let strategy = 'NONE';
                let entryPriceA, entryPriceB;
                let executionCost = 0;

                if (fundingDiff > 0) {
                    // A funding > B funding
                    // Strateji: A SHORT + B LONG
                    strategy = 'SHORT_A_LONG_B';
                    // SHORT için BID fiyatından sat, LONG için ASK fiyatından al
                    entryPriceA = infoA.bidPrice;
                    entryPriceB = infoB.askPrice;
                } else if (fundingDiff < 0) {
                    // B funding > A funding
                    // Strateji: A LONG + B SHORT
                    strategy = 'LONG_A_SHORT_B';
                    // LONG için ASK fiyatından al, SHORT için BID fiyatından sat
                    entryPriceA = infoA.askPrice;
                    entryPriceB = infoB.bidPrice;
                } else {
                    entryPriceA = infoA.markPrice;
                    entryPriceB = infoB.markPrice;
                }

                // Execution cost (Spread maliyet yüzdesi)
                const avgPrice = (infoA.markPrice + infoB.markPrice) / 2;
                if (strategy !== 'NONE') {
                    // Fiyatlar farklı borsalarda farklı olabilir (örn: BTC 95000 vs 95100)
                    // Spread maliyeti: |GirişA - GirişB| farkı değil, her birinin kendi spread'i önemlidir.
                    // Ancak burada basitleştirilmiş bir model kullanıyoruz.
                    // Gerçekçi spread maliyeti: (AskA - BidA)/MarkA + (AskB - BidB)/MarkB gibi olmalı.
                    // Mevcut mantığı koruyarak: Fiyat farkı maliyeti
                    executionCost = Math.abs(entryPriceA - entryPriceB) / avgPrice * 100;
                }

                // Fiyat farkı (informational)
                const priceDiff = ((infoA.markPrice - infoB.markPrice) / infoB.markPrice) * 100;

                // Fee hesaplamaları
                const entryFees = this.fees.exchangeA.taker + this.fees.exchangeB.taker;
                const exitFees = this.fees.exchangeA.taker + this.fees.exchangeB.taker;
                const totalFees = entryFees + exitFees;

                // Net kar (8 saatlik)
                const profitability8h = Math.abs(fundingDiff);
                // Not: Execution cost (fiyat farkı) funding arbitrajında tek seferlik bir maliyettir, 
                // funding geliri ise süreklidir. 8 saatlik net kar hesabında execution cost'u düşmek 
                // sadece 8 saat tutulacaksa doğrudur. Uzun vadede execution cost etkisi azalır.
                // Şimdilik muhafazakar hesaplama için düşüyoruz.
                const netProfit = profitability8h - executionCost - totalFees;

                // Yıllık getiri
                const annualReturn = this.calculateAnnualReturn(profitability8h);
                const annualReturnNet = this.calculateAnnualReturn(netProfit);

                // Detaylı işlem adımları
                const tradingSteps = strategy !== 'NONE'
                    ? this.generateTradingSteps(strategy, coin.symbol, infoA.lastFundingRate, infoB.lastFundingRate)
                    : [];

                return {
                    // Coin metadata
                    name: coin.name,
                    symbol: coin.symbol,
                    logo: coin.logo,
                    color: coin.color,

                    // Exchange A data
                    exchangeA: {
                        name: this.nameA,
                        symbol: infoA.symbol,
                        markPrice: infoA.markPrice,
                        bidPrice: infoA.bidPrice,
                        askPrice: infoA.askPrice,
                        indexPrice: infoA.indexPrice,
                        fundingRate: infoA.lastFundingRate,
                        nextFundingTime: infoA.nextFundingTime,
                        logo: this.getExchangeLogo(this.slugA)
                    },

                    // Exchange B data
                    exchangeB: {
                        name: this.nameB,
                        symbol: infoB.symbol,
                        markPrice: infoB.markPrice,
                        bidPrice: infoB.bidPrice,
                        askPrice: infoB.askPrice,
                        indexPrice: infoB.indexPrice,
                        fundingRate: infoB.lastFundingRate,
                        nextFundingTime: infoB.nextFundingTime,
                        logo: this.getExchangeLogo(this.slugB)
                    },

                    // Analysis
                    analysis: {
                        fundingDifference: fundingDiff,
                        priceDifference: priceDiff,
                        executionCost: executionCost,
                        profitability8h: profitability8h,
                        profitability8hNet: netProfit,
                        annualReturn: annualReturn,
                        annualReturnNet: annualReturnNet,
                        strategy: strategy,
                        isOpportunity: strategy !== 'NONE' && netProfit > 0
                    },

                    // Fees
                    fees: {
                        exchangeATaker: this.fees.exchangeA.taker,
                        exchangeBTaker: this.fees.exchangeB.taker,
                        entryFees: entryFees,
                        exitFees: exitFees,
                        totalFees: totalFees
                    },

                    // Trading steps
                    tradingSteps: tradingSteps,

                    timestamp: new Date()
                };
            });

            return opportunities.filter(opp => opp !== null);

        } catch (error) {
            console.error('Arbitrage calculation error:', error);
            return [];
        }
    }

    getExchangeLogo(slug) {
        const logos = {
            binance: 'https://public.bnbstatic.com/static/images/common/favicon.ico',
            okx: 'https://static.okx.com/cdn/assets/imgs/MjAyMQ/OKX-LOGO-ICON.png',
            hyperliquid: 'https://hyperliquid.xyz/favicon.ico'
        };
        return logos[slug] || '';
    }

    // En büyük 10 coin'i belirle (market cap'e göre) - Logo URL'leri ile
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
                hyperliquid: 'MATIC',
                name: 'Polygon',
                symbol: 'MATIC',
                logo: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
                color: '#8247E5'
            }
        ];
    }
}

module.exports = ArbitrageService;
