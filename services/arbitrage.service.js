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
        this.debugCount = 0; // For debug logging
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
                    return;
                }

                // STRICT VALIDATION: Both exchanges must have valid price AND funding rate
                const priceA = parseFloat(dataA.markPrice);
                const priceB = parseFloat(dataB.markPrice);
                const fundingA = parseFloat(dataA.fundingRate);
                const fundingB = parseFloat(dataB.fundingRate);

                if (!priceA || isNaN(priceA) || priceA <= 0) {
                    return; // Invalid price on exchange A
                }
                if (!priceB || isNaN(priceB) || priceB <= 0) {
                    return; // Invalid price on exchange B
                }
                if (isNaN(fundingA) || isNaN(fundingB)) {
                    return; // Invalid funding rate
                }

                // STRICT: Skip if EITHER funding rate is exactly 0 OR very close to 0
                // This catches delisted coins that have stale data
                if (Math.abs(fundingA) < 0.0001 || Math.abs(fundingB) < 0.0001) {
                    if (this.debugCount < 5) {
                        console.log(`[DEBUG] Skipping ${coin.symbol} due to near-zero funding rate: A=${fundingA}, B=${fundingB}`);
                        this.debugCount++;
                    }
                    return; // One exchange likely has stale/no data
                }

                // Skip if data is stale (no recent timestamp) - check if older than 5 minutes
                const now = Date.now();
                const maxAge = 5 * 60 * 1000; // 5 minutes
                if (dataA.timestamp && (now - dataA.timestamp) > maxAge) {
                    if (this.debugCount < 5) {
                        console.log(`[DEBUG] Skipping ${coin.symbol} due to stale data on ${this.nameA}. Age: ${(now - dataA.timestamp) / 1000}s`);
                        this.debugCount++;
                    }
                    return; // Stale data on exchange A
                }
                if (dataB.timestamp && (now - dataB.timestamp) > maxAge) {
                    return; // Stale data on exchange B
                }

                // PRICE RATIO CHECK: Detect 1000X/kX coin denomination mismatches
                // If one exchange lists "1000FLOKI" and another lists "FLOKI", prices will differ by ~1000x
                const priceRatio = priceA / priceB;
                if (priceRatio > 100 || priceRatio < 0.01) {
                    if (this.debugCount < 10) {
                        console.log(`[DEBUG] Skipping ${coin.symbol} due to price ratio mismatch: ${this.nameA}=$${priceA}, ${this.nameB}=$${priceB}, ratio=${priceRatio.toFixed(4)}`);
                        this.debugCount++;
                    }
                    return; // Likely 1000X denomination mismatch
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

        const markA = parseFloat(dataA.markPrice);
        const markB = parseFloat(dataB.markPrice);
        const fundingA = parseFloat(dataA.fundingRate);
        const fundingB = parseFloat(dataB.fundingRate);

        // Strateji Belirleme: Funding yönüne göre
        // (Funding A - Funding B) bize net akışı verir (basitçe)
        // Eğer A > B ise: A Long (Öder), B Short (Alır). Net = B - A.
        // Ama biz "Almak" istiyoruz. O zaman Funding'i düşük olana Long, yüksek olana Short açmalıyız (kabaca değil, detaylı analiz lazım).

        // Basit Mantık: Hangi kombinasyon daha çok funding getirir?
        // 1. Long A (+1), Short B (-1)
        //    Gelir = (A * -1 * sign) + (B * -1 * sign)
        // 2. Short A (-1), Long B (+1)

        // Bunu detaylı calculator zaten cycle içinde hesaplıyor. Biz iki senaryoyu da deneyip en iyisini seçelim.

        const scenario1 = calculateDetailedFunding(
            this.nameA, this.nameB, dataA, dataB, 'LONG_A_SHORT_B', 100
        );

        const scenario2 = calculateDetailedFunding(
            this.nameA, this.nameB, dataA, dataB, 'SHORT_A_LONG_B', 100
        );

        // Hangisi daha karlı (Yıllık APR olarak)?
        let bestScenario = scenario1.annual.apr > scenario2.annual.apr ? scenario1 : scenario2;
        let strategy = scenario1.annual.apr > scenario2.annual.apr ? 'LONG_A_SHORT_B' : 'SHORT_A_LONG_B';

        // REMOVED STRICT FILTERS to verify data flow
        // The user wants to see "All Opps" even if not profitable.

        const tradeSize = 100;

        // Maliyet Hesabı (Cost Analysis)
        // 1. Fees (Open + Close)
        const makerFeeA = this.fees.exchangeA.maker; // ratio
        const takerFeeA = this.fees.exchangeA.taker;
        const makerFeeB = this.fees.exchangeB.maker;
        const takerFeeB = this.fees.exchangeB.taker;

        // Varsayım: Taker girip Taker çıkıyoruz (En kötü senaryo - Conservative)
        // Veya Maker girip Taker çıkıyoruz.
        // Kullanıcı Taker (Market) ve Maker (Limit) ayrımı istemişti UI'da.
        // Biz "Net Profit" filtresi için Taker/Taker (En pahalı) maliyeti kullanalım, garanti olsun.
        const openCost = tradeSize * (takerFeeA + takerFeeB);
        const closeCost = tradeSize * (takerFeeA + takerFeeB);

        // 2. Price Difference Impact (Initial Loss)
        // Fiyat farkı bizim aleyhimize ise maliyettir.
        // Long A (100), Short B (101). Fark %1.
        // Çıkışta fiyatlar eşitlenirse (100.5), B'den 0.5 kazanırız, A'dan 0.5 kazanırız. Fark cebe girer.
        // Long A (101), Short B (100). Fark -%1.
        // Çıkışta eşitlenirse, ikisinden de zarar ederiz.
        // Yani: (Giriş Kısa Fiyatı - Giriş Uzun Fiyatı) / Giriş Uzun Fiyatı
        // Eğer Short Fiyatı > Long Fiyatı ise (Premium), kar ederiz (Pozitif Diff).
        // Eğer Short Fiyatı < Long Fiyatı ise (Discount), zarar ederiz (Negatif Diff).

        let priceDiffPercent = 0;
        if (strategy === 'LONG_A_SHORT_B') {
            // Long A, Short B. Bizim için iyi olan B > A olması.
            priceDiffPercent = ((markB - markA) / markA) * 100;
        } else {
            // Short A, Long B. Bizim için iyi olan A > B olması.
            priceDiffPercent = ((markA - markB) / markB) * 100;
        }

        const priceDiffPnL = tradeSize * (priceDiffPercent / 100);

        // Toplam Döngü Kârı (Net Cycle Profit)
        // Cycle Funding Geliri + Fiyat Farkı PnL - Komisyonlar
        // NOT: Fiyat farkı "Cycle" sonunda kapanmayabilir. Ama "Initial Haircut" olarak düşersek güvenli olur.
        // Kullanıcı "Price Difference"ı hesaba katmamızı istedi.
        const totalNetProfit = bestScenario.funding.netCycleIncomeUsd + priceDiffPnL - openCost - closeCost;

        // Determine validity based on profit, but don't hide data
        const isOpportunity = totalNetProfit > 0;

        // Data Hazırla
        return {
            strategy,
            tradeSize,
            priceDiffPercent,
            priceDiffPnL,

            // Funding Info
            cycleDuration: bestScenario.cycle.durationHours,
            fundingIncomeCycle: bestScenario.funding.netCycleIncomeUsd,
            netCycleProfit: totalNetProfit,

            // Fees
            fees: {
                open: openCost,
                close: closeCost
            },

            // Annual (Saf Funding APR + Net Profit projection?)
            // Kullanıcı: "ARP hesabını da feeleri ve initial price hesaba katmadan funding feeler üzerinden yap"
            annualAPR: bestScenario.annual.apr,
            annualFunding: bestScenario.annual.usd,

            isOpportunity: isOpportunity,
            detailed: bestScenario
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
