class ArbitrageService {
    constructor(binanceService, okxService) {
        this.binance = binanceService;
        this.okx = okxService;

        // Trading fees (taker fees for market orders)
        // TEMPORARILY SET TO 0 FOR TESTING
        this.fees = {
            binance: {
                maker: 0.00,  // 0.00%
                taker: 0.00   // 0.00%
            },
            okx: {
                maker: 0.00,  // 0.00%
                taker: 0.00   // 0.00%
            }
        };
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

    // Yıllık getiri hesaplama (8 saatlik funding'den)
    calculateAnnualReturn(fundingRate8h) {
        // 8 saatte bir funding var, günde 3 kez (24/8 = 3)
        // Yılda 365 * 3 = 1095 funding period
        const annualReturn = fundingRate8h * 1095;
        return annualReturn;
    }

    // Net kar hesaplama (trading fee'leri dahil)
    calculateNetProfit(fundingDiff, entryFees, exitFees) {
        // Entry: Her iki borsada da pozisyon açma (taker fee)
        // Exit: Her iki borsada da pozisyon kapatma (taker fee)
        const totalFees = entryFees + exitFees;
        const netProfit = fundingDiff - totalFees;
        return netProfit;
    }

    // Detaylı işlem adımları oluşturma
    generateTradingSteps(strategy, coin, binanceFR, okxFR) {
        const steps = [];

        if (strategy === 'BINANCE_SHORT_OKX_LONG') {
            steps.push({
                step: 1,
                action: 'OPEN',
                exchange: 'Binance',
                side: 'SELL (SHORT)',
                description: `Open SHORT position on Binance`,
                fee: this.fees.binance.taker,
                feeType: 'Entry Fee'
            });
            steps.push({
                step: 2,
                action: 'OPEN',
                exchange: 'OKX',
                side: 'BUY (LONG)',
                description: `Open LONG position on OKX`,
                fee: this.fees.okx.taker,
                feeType: 'Entry Fee'
            });
            steps.push({
                step: 3,
                action: 'HOLD',
                exchange: 'Both',
                side: 'WAIT',
                description: `Wait for funding settlement (every 8h)`,
                fee: 0,
                feeType: 'Funding Payment',
                fundingReceive: `Receive ${Math.abs(binanceFR).toFixed(4)}% on Binance SHORT`,
                fundingPay: `Pay ${Math.abs(okxFR).toFixed(4)}% on OKX LONG`
            });
            steps.push({
                step: 4,
                action: 'CLOSE',
                exchange: 'Binance',
                side: 'BUY (Close SHORT)',
                description: `Close SHORT position on Binance`,
                fee: this.fees.binance.taker,
                feeType: 'Exit Fee'
            });
            steps.push({
                step: 5,
                action: 'CLOSE',
                exchange: 'OKX',
                side: 'SELL (Close LONG)',
                description: `Close LONG position on OKX`,
                fee: this.fees.okx.taker,
                feeType: 'Exit Fee'
            });
        } else if (strategy === 'BINANCE_LONG_OKX_SHORT') {
            steps.push({
                step: 1,
                action: 'OPEN',
                exchange: 'Binance',
                side: 'BUY (LONG)',
                description: `Open LONG position on Binance`,
                fee: this.fees.binance.taker,
                feeType: 'Entry Fee'
            });
            steps.push({
                step: 2,
                action: 'OPEN',
                exchange: 'OKX',
                side: 'SELL (SHORT)',
                description: `Open SHORT position on OKX`,
                fee: this.fees.okx.taker,
                feeType: 'Entry Fee'
            });
            steps.push({
                step: 3,
                action: 'HOLD',
                exchange: 'Both',
                side: 'WAIT',
                description: `Wait for funding settlement (every 8h)`,
                fee: 0,
                feeType: 'Funding Payment',
                fundingPay: `Pay ${Math.abs(binanceFR).toFixed(4)}% on Binance LONG`,
                fundingReceive: `Receive ${Math.abs(okxFR).toFixed(4)}% on OKX SHORT`
            });
            steps.push({
                step: 4,
                action: 'CLOSE',
                exchange: 'Binance',
                side: 'SELL (Close LONG)',
                description: `Close LONG position on Binance`,
                fee: this.fees.binance.taker,
                feeType: 'Exit Fee'
            });
            steps.push({
                step: 5,
                action: 'CLOSE',
                exchange: 'OKX',
                side: 'BUY (Close SHORT)',
                description: `Close SHORT position on OKX`,
                fee: this.fees.okx.taker,
                feeType: 'Exit Fee'
            });
        }

        return steps;
    }
    // Her iki borsadan da veri çek ve karşılaştır
    async getArbitrageOpportunities() {
        const topCoins = this.getTopCoins();

        try {
            // Binance verilerini çek
            const binanceSymbols = topCoins.map(c => c.binance);
            const binanceData = await this.binance.getMultiplePremiumIndex(binanceSymbols);

            // OKX verilerini çek
            const okxSymbols = topCoins.map(c => c.okx);
            const okxData = await this.okx.getMultipleFundingData(okxSymbols);

            // Verileri birleştir ve arbitraj fırsatlarını hesapla
            const opportunities = topCoins.map(coin => {
                const binanceInfo = binanceData.find(d => d.symbol === coin.binance);
                const okxInfo = okxData.find(d => d.symbol === coin.okx);

                if (!binanceInfo || !okxInfo) {
                    return null;
                }

                const fundingDiff = binanceInfo.lastFundingRate - okxInfo.lastFundingRate;

                // STRATEJI: Sadece funding rate farkına göre belirle (fee 0 olduğu için)
                // Hangi tarafın funding rate'i yüksekse, orada SHORT aç (funding al)
                // Diğer tarafta LONG aç (funding öde ama daha az)
                let strategy = 'NONE';
                let entryPriceBinance, entryPriceOKX;
                let executionCost = 0; // Bid/Ask spread'den kaynaklanan maliyet

                if (fundingDiff > 0) {
                    // Binance funding > OKX funding
                    // Strateji: Binance SHORT + OKX LONG
                    strategy = 'BINANCE_SHORT_OKX_LONG';
                    // SHORT için BID fiyatından sat, LONG için ASK fiyatından al
                    entryPriceBinance = binanceInfo.bidPrice;
                    entryPriceOKX = okxInfo.askPrice;
                } else if (fundingDiff < 0) {
                    // OKX funding > Binance funding
                    // Strateji: Binance LONG + OKX SHORT
                    strategy = 'BINANCE_LONG_OKX_SHORT';
                    // LONG için ASK fiyatından al, SHORT için BID fiyatından sat
                    entryPriceBinance = binanceInfo.askPrice;
                    entryPriceOKX = okxInfo.bidPrice;
                } else {
                    // Funding eşit, arbitraj yok
                    entryPriceBinance = binanceInfo.markPrice;
                    entryPriceOKX = okxInfo.markPrice;
                }

                // Execution cost (Spread maliyet yüzdesi)
                // Eğer fiyatlar birbirinden farklıysa, bu farka göre ekstra maliyet var
                const avgPrice = (binanceInfo.markPrice + okxInfo.markPrice) / 2;
                if (strategy !== 'NONE') {
                    executionCost = Math.abs(entryPriceBinance - entryPriceOKX) / avgPrice * 100;
                }

                // Fiyat farkı (informational)
                const priceDiff = ((binanceInfo.markPrice - okxInfo.markPrice) / okxInfo.markPrice) * 100;

                // Fee hesaplamaları
                const entryFees = this.fees.binance.taker + this.fees.okx.taker;
                const exitFees = this.fees.binance.taker + this.fees.okx.taker;
                const totalFees = entryFees + exitFees;

                // Net kar (8 saatlik): Funding rate farkı - Execution cost - Fees
                const profitability8h = Math.abs(fundingDiff);
                const netProfit = profitability8h - executionCost - totalFees;

                // Yıllık getiri hesaplama
                const annualReturn = this.calculateAnnualReturn(profitability8h);
                const annualReturnNet = this.calculateAnnualReturn(netProfit);

                // Detaylı işlem adımları
                const tradingSteps = strategy !== 'NONE'
                    ? this.generateTradingSteps(strategy, coin.symbol, binanceInfo.lastFundingRate, okxInfo.lastFundingRate)
                    : [];

                return {
                    // Coin metadata
                    name: coin.name,
                    symbol: coin.symbol,
                    logo: coin.logo,
                    color: coin.color,

                    // Binance data
                    binance: {
                        symbol: binanceInfo.symbol,
                        markPrice: binanceInfo.markPrice,
                        bidPrice: binanceInfo.bidPrice,
                        askPrice: binanceInfo.askPrice,
                        indexPrice: binanceInfo.indexPrice,
                        fundingRate: binanceInfo.lastFundingRate,
                        nextFundingTime: binanceInfo.nextFundingTime,
                        logo: 'https://public.bnbstatic.com/static/images/common/favicon.ico'
                    },

                    // OKX data
                    okx: {
                        symbol: okxInfo.symbol,
                        markPrice: okxInfo.markPrice,
                        bidPrice: okxInfo.bidPrice,
                        askPrice: okxInfo.askPrice,
                        indexPrice: okxInfo.indexPrice,
                        fundingRate: okxInfo.lastFundingRate,
                        nextFundingTime: okxInfo.nextFundingTime,
                        logo: 'https://static.okx.com/cdn/assets/imgs/MjAyMQ/OKX-LOGO-ICON.png'
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
                        binanceTaker: this.fees.binance.taker,
                        okxTaker: this.fees.okx.taker,
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
            console.error('Error getting arbitrage opportunities:', error);
            throw error;
        }
    }
}

module.exports = ArbitrageService;
