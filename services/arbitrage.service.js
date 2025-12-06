const BinanceWebSocket = require('./websocket/binance.ws');
const OKXWebSocket = require('./websocket/okx.ws');
const HyperliquidWebSocket = require('./websocket/hyperliquid.ws');
const { calculateDetailedFunding, getHoursUntilFunding } = require('./funding-calculator');

class ArbitrageService {
    constructor(exchangeA, exchangeB) {
        this.nameA = exchangeA.name;
        this.nameB = exchangeB.name;
        this.slugA = exchangeA.slug;
        this.slugB = exchangeB.slug;
        this.wsA = exchangeA.ws;
        this.wsB = exchangeB.ws;
        this.fees = {
            exchangeA: { taker: 0.0005, maker: 0.0002 },
            exchangeB: { taker: 0.0005, maker: 0.0002 }
        };
    }

    getArbitrageOpportunities() {
        try {
            const opportunities = [];
            const topCoins = this.getTopCoins();

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

                // Arbitraj Analizi
                const analysis = this.analyzeArbitrage(dataA, dataB, symbolA, symbolB);

                // Eğer analiz null veya fırsat yoksa atla
                if (!analysis || !analysis.isOpportunity) {
                    return;
                }

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

            // Kârlılığa göre sırala (TÜM fırsatları döndür, server'da top 10 seçilecek)
            return opportunities
                .sort((a, b) => b.analysis.annualAPR - a.analysis.annualAPR);

        } catch (error) {
            console.error(`[${this.nameA}-${this.nameB}] Arbitrage calculation error:`, error.message);
            return [];
        }
    }

    getExchangeLogo(slug) {
        const logos = {
            binance: '/logos/binance.png',
            okx: '/logos/okx.png',
            hyperliquid: '/logos/hyperliquid.png',
            bybit: '/logos/bybit.png',
            asterdex: '/logos/asterdex.png'
        };
        return logos[slug] || '';
    }

    // Yeni method: Tüm coinlerin her iki borsadaki raw datasını döndür
    getAllRawData() {
        const coins = ArbitrageService.getCoinList();
        const rawData = [];

        coins.forEach(coin => {
            const symbolA = coin[this.slugA];
            const symbolB = coin[this.slugB];

            if (!symbolA || !symbolB) return;

            const dataA = this.wsA.getData(symbolA);
            const dataB = this.wsB.getData(symbolB);

            rawData.push({
                symbol: coin.symbol,
                name: coin.name,
                logo: coin.logo,
                color: coin.color,
                [this.slugA]: dataA ? {
                    markPrice: dataA.markPrice,
                    fundingRate: dataA.fundingRate,
                    nextFundingTime: dataA.nextFundingTime
                } : null,
                [this.slugB]: dataB ? {
                    markPrice: dataB.markPrice,
                    fundingRate: dataB.fundingRate,
                    nextFundingTime: dataB.nextFundingTime
                } : null
            });
        });

        return rawData;
    }

    analyzeArbitrage(dataA, dataB, symbolA, symbolB) {
        if (!dataA || !dataB) return null;

        const markA = dataA.markPrice;
        const markB = dataB.markPrice;
        const fundingA = dataA.fundingRate; // %
        const fundingB = dataB.fundingRate; // %

        // Strateji Belirleme: Hangi yönde funding kazanırız?
        // Senaryo 1: Long A + Short B
        const netFundingLongAShortB = -fundingA + fundingB;

        // Senaryo 2: Short A + Long B
        const netFundingShortALongB = fundingA - fundingB;

        let strategy = '';
        let netFundingRate = 0;

        if (netFundingLongAShortB > netFundingShortALongB) {
            strategy = 'LONG_A_SHORT_B';
            netFundingRate = netFundingLongAShortB;
        } else {
            strategy = 'SHORT_A_LONG_B';
            netFundingRate = netFundingShortALongB;
        }

        // Eğer en iyi senaryoda bile funding negatifse, işlem yapma
        if (netFundingRate <= 0) {
            return {
                strategy: 'NO_OPPORTUNITY',
                isOpportunity: false,
                tradeSize: 100,
                priceDifferencePercent: 0,
                priceDifferencePnL: 0,
                fundingDifferencePercent: 0,
                fundingPnL8h: 0,
                annualFundingPnL: 0,
                annualAPR: 0,
                detailedFunding: null
            };
        }

        const tradeSize = 100;

        // Calculate detailed funding with intervals
        const detailedFunding = calculateDetailedFunding(
            this.nameA,
            this.nameB,
            dataA,
            dataB,
            strategy,
            tradeSize
        );

        // Initial fees (Maker + Taker)
        const makerFeeA = this.fees.exchangeA.maker * 100; // %
        const takerFeeA = this.fees.exchangeA.taker * 100; // %
        const makerFeeB = this.fees.exchangeB.maker * 100; // %
        const takerFeeB = this.fees.exchangeB.taker * 100; // %

        // Total initial fees
        const totalInitialFeeMaker = (makerFeeA + makerFeeB) / 100 * tradeSize;
        const totalInitialFeeTaker = (takerFeeA + takerFeeB) / 100 * tradeSize;

        // Breakeven calculation
        const breakevenHoursMaker = totalInitialFeeMaker / (detailedFunding.fundingInFirstPeriod / detailedFunding.firstDualFundingHours);
        const breakevenHoursTaker = totalInitialFeeTaker / (detailedFunding.fundingInFirstPeriod / detailedFunding.firstDualFundingHours);

        // Fiyat Farkı (Bilgi Amaçlı)
        let priceDiffPercent = 0;
        if (strategy === 'LONG_A_SHORT_B') {
            priceDiffPercent = ((markB - markA) / markA) * 100;
        } else {
            priceDiffPercent = ((markA - markB) / markB) * 100;
        }
        const priceDiffPnL = (priceDiffPercent / 100) * tradeSize;

        return {
            strategy,
            tradeSize,
            priceDifferencePercent: priceDiffPercent,
            priceDifferencePnL: priceDiffPnL,
            fundingDifferencePercent: netFundingRate,
            fundingPnL8h: detailedFunding.fundingInFirstPeriod,
            annualFundingPnL: detailedFunding.annualFunding,
            annualAPR: detailedFunding.annualAPR,
            isOpportunity: true,
            // Detailed funding info
            detailedFunding: {
                ...detailedFunding,
                fees: {
                    makerFeeA,
                    takerFeeA,
                    makerFeeB,
                    takerFeeB,
                    totalInitialFeeMaker,
                    totalInitialFeeTaker
                },
                breakeven: {
                    hoursMaker: breakevenHoursMaker,
                    hoursTaker: breakevenHoursTaker,
                    daysMaker: breakevenHoursMaker / 24,
                    daysTaker: breakevenHoursTaker / 24
                }
            }
        };
    }

    // Statik metod: Coin listesini dışarıdan almak için (5 borsada da ortak coinler)
    // Now loading 541 coins from external module
    static getCoinList() {
        return require('./coin-list');
    }

    getTopCoins() {
        return ArbitrageService.getCoinList();
    }
}

module.exports = ArbitrageService;
