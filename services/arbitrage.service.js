const BinanceWebSocket = require('./websocket/binance.ws');
const OKXWebSocket = require('./websocket/okx.ws');
const HyperliquidWebSocket = require('./websocket/hyperliquid.ws');

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
        // Funding pozitifse: Long öder, Short alır.
        // Funding negatifse: Short öder, Long alır.

        // Senaryo 1: Long A + Short B
        // Getiri: -FundingA + FundingB
        const netFundingLongAShortB = -fundingA + fundingB;

        // Senaryo 2: Short A + Long B
        // Getiri: +FundingA - FundingB
        const netFundingShortALongB = fundingA - fundingB;

        let strategy = '';
        let netFundingRate8h = 0;

        if (netFundingLongAShortB > netFundingShortALongB) {
            strategy = 'LONG_A_SHORT_B';
            netFundingRate8h = netFundingLongAShortB;
        } else {
            strategy = 'SHORT_A_LONG_B';
            netFundingRate8h = netFundingShortALongB;
        }

        // Eğer en iyi senaryoda bile funding negatifse, işlem yapma
        if (netFundingRate8h <= 0) {
            return {
                strategy: 'NO_OPPORTUNITY',
                isOpportunity: false,
                tradeSize: 100,
                priceDifferencePercent: 0,
                priceDifferencePnL: 0,
                fundingDifferencePercent: 0,
                fundingPnL8h: 0,
                annualFundingPnL: 0,
                annualAPR: 0
            };
        }

        // YENİ MANTIK: 100$ İşlem Büyüklüğü
        const tradeSize = 100;

        // 1. Funding Kârı (8 saatlik)
        const fundingPnL8hDollar = (netFundingRate8h / 100) * tradeSize;

        // 2. Yıllık Tahmini Getiri (APR) - Sadece Funding üzerinden
        const annualFundingPnL = fundingPnL8hDollar * 3 * 365;
        const annualAPR = netFundingRate8h * 3 * 365; // %

        // 3. Fiyat Farkı (Bilgi Amaçlı)
        let priceDiffPercent = 0;
        if (strategy === 'LONG_A_SHORT_B') {
            priceDiffPercent = ((markB - markA) / markA) * 100;
        } else {
            priceDiffPercent = ((markA - markB) / markB) * 100;
        }
        const priceDiffPnL = (priceDiffPercent / 100) * tradeSize;

        // Fırsat Eşiği: Net Funding > 0
        const isOpportunity = netFundingRate8h > 0;

        return {
            strategy,
            tradeSize,
            priceDifferencePercent: priceDiffPercent,
            priceDifferencePnL: priceDiffPnL,
            fundingDifferencePercent: netFundingRate8h,
            fundingPnL8h: fundingPnL8hDollar,
            annualFundingPnL,
            annualAPR,
            isOpportunity
        };
    }

    // Statik metod: Coin listesini dışarıdan almak için (5 borsada da ortak coinler)
    static getCoinList() {
        const coins = [
            { "binance": "BTCUSDT", "okx": "BTC-USDT-SWAP", "hyperliquid": "BTC", "bybit": "BTCUSDT", "asterdex": "BTCUSDT", "name": "BTC", "symbol": "BTC", "logo": "https://cryptologos.cc/logos/bitcoin-btc-logo.png", "color": "#F7931A" },
            { "binance": "ETHUSDT", "okx": "ETH-USDT-SWAP", "hyperliquid": "ETH", "bybit": "ETHUSDT", "asterdex": "ETHUSDT", "name": "ETH", "symbol": "ETH", "logo": "https://cryptologos.cc/logos/ethereum-eth-logo.png", "color": "#627EEA" },
            { "binance": "SOLUSDT", "okx": "SOL-USDT-SWAP", "hyperliquid": "SOL", "bybit": "SOLUSDT", "asterdex": "SOLUSDT", "name": "SOL", "symbol": "SOL", "logo": "https://cryptologos.cc/logos/solana-sol-logo.png", "color": "#14F195" },
            { "binance": "BNBUSDT", "okx": "BNB-USDT-SWAP", "hyperliquid": "BNB", "bybit": "BNBUSDT", "asterdex": "BNBUSDT", "name": "BNB", "symbol": "BNB", "logo": "https://cryptologos.cc/logos/bnb-bnb-logo.png", "color": "#F3BA2F" },
            { "binance": "XRPUSDT", "okx": "XRP-USDT-SWAP", "hyperliquid": "XRP", "bybit": "XRPUSDT", "asterdex": "XRPUSDT", "name": "XRP", "symbol": "XRP", "logo": "https://cryptologos.cc/logos/xrp-xrp-logo.png", "color": "#23292F" },
            { "binance": "DOGEUSDT", "okx": "DOGE-USDT-SWAP", "hyperliquid": "DOGE", "bybit": "DOGEUSDT", "asterdex": "DOGEUSDT", "name": "DOGE", "symbol": "DOGE", "logo": "https://cryptologos.cc/logos/dogecoin-doge-logo.png", "color": "#C2A633" },
            { "binance": "ADAUSDT", "okx": "ADA-USDT-SWAP", "hyperliquid": "ADA", "bybit": "ADAUSDT", "asterdex": "ADAUSDT", "name": "ADA", "symbol": "ADA", "logo": "https://cryptologos.cc/logos/cardano-ada-logo.png", "color": "#0033AD" },
            { "binance": "AVAXUSDT", "okx": "AVAX-USDT-SWAP", "hyperliquid": "AVAX", "bybit": "AVAXUSDT", "asterdex": "AVAXUSDT", "name": "AVAX", "symbol": "AVAX", "logo": "https://cryptologos.cc/logos/avalanche-avax-logo.png", "color": "#E84142" },
            { "binance": "LINKUSDT", "okx": "LINK-USDT-SWAP", "hyperliquid": "LINK", "bybit": "LINKUSDT", "asterdex": "LINKUSDT", "name": "LINK", "symbol": "LINK", "logo": "https://cryptologos.cc/logos/chainlink-link-logo.png", "color": "#2A5ADA" },
            { "binance": "SUIUSDT", "okx": "SUI-USDT-SWAP", "hyperliquid": "SUI", "bybit": "SUIUSDT", "asterdex": "SUIUSDT", "name": "SUI", "symbol": "SUI", "logo": "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg", "color": "#4DA2FF" },
            { "binance": "LTCUSDT", "okx": "LTC-USDT-SWAP", "hyperliquid": "LTC", "bybit": "LTCUSDT", "asterdex": "LTCUSDT", "name": "LTC", "symbol": "LTC", "logo": "https://cryptologos.cc/logos/litecoin-ltc-logo.png", "color": "#345D9D" },
            { "binance": "BCHUSDT", "okx": "BCH-USDT-SWAP", "hyperliquid": "BCH", "bybit": "BCHUSDT", "asterdex": "BCHUSDT", "name": "BCH", "symbol": "BCH", "logo": "https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png", "color": "#0AC18E" },
            { "binance": "DOTUSDT", "okx": "DOT-USDT-SWAP", "hyperliquid": "DOT", "bybit": "DOTUSDT", "asterdex": "DOTUSDT", "name": "DOT", "symbol": "DOT", "logo": "https://cryptologos.cc/logos/polkadot-new-dot-logo.png", "color": "#E6007A" },
            { "binance": "UNIUSDT", "okx": "UNI-USDT-SWAP", "hyperliquid": "UNI", "bybit": "UNIUSDT", "asterdex": "UNIUSDT", "name": "UNI", "symbol": "UNI", "logo": "https://cryptologos.cc/logos/uniswap-uni-logo.png", "color": "#FF007A" },
            { "binance": "APTUSDT", "okx": "APT-USDT-SWAP", "hyperliquid": "APT", "bybit": "APTUSDT", "asterdex": "APTUSDT", "name": "APT", "symbol": "APT", "logo": "https://cryptologos.cc/logos/aptos-apt-logo.png", "color": "#000000" },
            { "binance": "NEARUSDT", "okx": "NEAR-USDT-SWAP", "hyperliquid": "NEAR", "bybit": "NEARUSDT", "asterdex": "NEARUSDT", "name": "NEAR", "symbol": "NEAR", "logo": "https://cryptologos.cc/logos/near-protocol-near-logo.png", "color": "#000000" },
            { "binance": "ARBUSDT", "okx": "ARB-USDT-SWAP", "hyperliquid": "ARB", "bybit": "ARBUSDT", "asterdex": "ARBUSDT", "name": "ARB", "symbol": "ARB", "logo": "https://cryptologos.cc/logos/arbitrum-arb-logo.png", "color": "#2D374B" },
            { "binance": "FILUSDT", "okx": "FIL-USDT-SWAP", "hyperliquid": "FIL", "bybit": "FILUSDT", "asterdex": "FILUSDT", "name": "FIL", "symbol": "FIL", "logo": "https://cryptologos.cc/logos/filecoin-fil-logo.png", "color": "#0090FF" },
            { "binance": "ATOMUSDT", "okx": "ATOM-USDT-SWAP", "hyperliquid": "ATOM", "bybit": "ATOMUSDT", "asterdex": "ATOMUSDT", "name": "ATOM", "symbol": "ATOM", "logo": "https://cryptologos.cc/logos/cosmos-atom-logo.png", "color": "#2E3148" },
            { "binance": "OPUSDT", "okx": "OP-USDT-SWAP", "hyperliquid": "OP", "bybit": "OPUSDT", "asterdex": "OPUSDT", "name": "OP", "symbol": "OP", "logo": "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png", "color": "#FF0420" },
            { "binance": "INJUSDT", "okx": "INJ-USDT-SWAP", "hyperliquid": "INJ", "bybit": "INJUSDT", "asterdex": "INJUSDT", "name": "INJ", "symbol": "INJ", "logo": "https://assets.coingecko.com/coins/images/12882/small/Secondary_Symbol.png", "color": "#000000" },
            { "binance": "TIAUSDT", "okx": "TIA-USDT-SWAP", "hyperliquid": "TIA", "bybit": "TIAUSDT", "asterdex": "TIAUSDT", "name": "TIA", "symbol": "TIA", "logo": "https://assets.coingecko.com/coins/images/31967/small/tia.jpg", "color": "#000000" },
            { "binance": "SEIUSDT", "okx": "SEI-USDT-SWAP", "hyperliquid": "SEI", "bybit": "SEIUSDT", "asterdex": "SEIUSDT", "name": "SEI", "symbol": "SEI", "logo": "https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png", "color": "#000000" },
            { "binance": "LDOUSDT", "okx": "LDO-USDT-SWAP", "hyperliquid": "LDO", "bybit": "LDOUSDT", "asterdex": "LDOUSDT", "name": "LDO", "symbol": "LDO", "logo": "https://cryptologos.cc/logos/lido-dao-ldo-logo.png", "color": "#000000" },
            { "binance": "ETCUSDT", "okx": "ETC-USDT-SWAP", "hyperliquid": "ETC", "bybit": "ETCUSDT", "asterdex": "ETCUSDT", "name": "ETC", "symbol": "ETC", "logo": "https://cryptologos.cc/logos/ethereum-classic-etc-logo.png", "color": "#000000" },
            { "binance": "STXUSDT", "okx": "STX-USDT-SWAP", "hyperliquid": "STX", "bybit": "STXUSDT", "asterdex": "STXUSDT", "name": "STX", "symbol": "STX", "logo": "https://cryptologos.cc/logos/stacks-stx-logo.png", "color": "#000000" },
            { "binance": "IMXUSDT", "okx": "IMX-USDT-SWAP", "hyperliquid": "IMX", "bybit": "IMXUSDT", "asterdex": "IMXUSDT", "name": "IMX", "symbol": "IMX", "logo": "https://cryptologos.cc/logos/immutable-x-imx-logo.png", "color": "#000000" },
            { "binance": "AAVEUSDT", "okx": "AAVE-USDT-SWAP", "hyperliquid": "AAVE", "bybit": "AAVEUSDT", "asterdex": "AAVEUSDT", "name": "AAVE", "symbol": "AAVE", "logo": "https://cryptologos.cc/logos/aave-aave-logo.png", "color": "#000000" },
            { "binance": "WLDUSDT", "okx": "WLD-USDT-SWAP", "hyperliquid": "WLD", "bybit": "WLDUSDT", "asterdex": "WLDUSDT", "name": "WLD", "symbol": "WLD", "logo": "https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg", "color": "#000000" },
            { "binance": "PEPEUSDT", "okx": "PEPE-USDT-SWAP", "hyperliquid": "PEPE", "bybit": "PEPEUSDT", "asterdex": "PEPEUSDT", "name": "PEPE", "symbol": "PEPE", "logo": "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg", "color": "#000000" }
        ];

        // Add fallback logo for missing images
        return coins.map(coin => ({
            ...coin,
            logo: coin.logo || `https://via.placeholder.com/32/000000/FFFFFF?text=${coin.symbol}`
        }));
    }

    getTopCoins() {
        return ArbitrageService.getCoinList();
    }
}

module.exports = ArbitrageService;
