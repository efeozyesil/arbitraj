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

        // 4. Toplam Net Kâr (8h Funding + Price Diff)
        const totalNetProfit8h = fundingPnL8hDollar + priceDiffPnL;

        // Fırsat Eşiği: Net Funding > 0
        const isOpportunity = netFundingRate8h > 0;

        return {
            strategy,
            tradeSize,
            priceDifferencePercent: priceDiffPercent,
            priceDifferencePnL: priceDiffPnL,
            fundingDifferencePercent: netFundingRate8h,
            fundingPnL8h: fundingPnL8hDollar,
            totalNetProfit8h, // Yeni alan
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
            { "binance": "MATICUSDT", "okx": "MATIC-USDT-SWAP", "hyperliquid": "MATIC", "bybit": "MATICUSDT", "asterdex": "MATICUSDT", "name": "MATIC", "symbol": "MATIC", "logo": "https://cryptologos.cc/logos/polygon-matic-logo.png", "color": "#8247E5" },
            { "binance": "ETCUSDT", "okx": "ETC-USDT-SWAP", "hyperliquid": "ETC", "bybit": "ETCUSDT", "asterdex": "ETCUSDT", "name": "ETC", "symbol": "ETC", "logo": "https://cryptologos.cc/logos/ethereum-classic-etc-logo.png", "color": "#34FA99" },
            { "binance": "IMXUSDT", "okx": "IMX-USDT-SWAP", "hyperliquid": "IMX", "bybit": "IMXUSDT", "asterdex": "IMXUSDT", "name": "IMX", "symbol": "IMX", "logo": "https://cryptologos.cc/logos/immutable-x-imx-logo.png", "color": "#000000" },
            { "binance": "RNDRUSDT", "okx": "RNDR-USDT-SWAP", "hyperliquid": "RNDR", "bybit": "RNDRUSDT", "asterdex": "RNDRUSDT", "name": "RNDR", "symbol": "RNDR", "logo": "https://cryptologos.cc/logos/render-token-rndr-logo.png", "color": "#FF0000" },
            { "binance": "INJUSDT", "okx": "INJ-USDT-SWAP", "hyperliquid": "INJ", "bybit": "INJUSDT", "asterdex": "INJUSDT", "name": "INJ", "symbol": "INJ", "logo": "https://cryptologos.cc/logos/injective-protocol-inj-logo.png", "color": "#00A3FF" },
            { "binance": "STXUSDT", "okx": "STX-USDT-SWAP", "hyperliquid": "STX", "bybit": "STXUSDT", "asterdex": "STXUSDT", "name": "STX", "symbol": "STX", "logo": "https://cryptologos.cc/logos/stacks-stx-logo.png", "color": "#5546FF" },
            { "binance": "GRTUSDT", "okx": "GRT-USDT-SWAP", "hyperliquid": "GRT", "bybit": "GRTUSDT", "asterdex": "GRTUSDT", "name": "GRT", "symbol": "GRT", "logo": "https://cryptologos.cc/logos/the-graph-grt-logo.png", "color": "#6747ED" },
            { "binance": "VETUSDT", "okx": "VET-USDT-SWAP", "hyperliquid": "VET", "bybit": "VETUSDT", "asterdex": "VETUSDT", "name": "VET", "symbol": "VET", "logo": "https://cryptologos.cc/logos/vechain-vet-logo.png", "color": "#15BDFF" },
            { "binance": "RUNEUSDT", "okx": "RUNE-USDT-SWAP", "hyperliquid": "RUNE", "bybit": "RUNEUSDT", "asterdex": "RUNEUSDT", "name": "RUNE", "symbol": "RUNE", "logo": "https://cryptologos.cc/logos/thorchain-rune-logo.png", "color": "#00D2FF" },
            { "binance": "THETAUSDT", "okx": "THETA-USDT-SWAP", "hyperliquid": "THETA", "bybit": "THETAUSDT", "asterdex": "THETAUSDT", "name": "THETA", "symbol": "THETA", "logo": "https://cryptologos.cc/logos/theta-theta-logo.png", "color": "#2AB8E6" },
            { "binance": "MKRUSDT", "okx": "MKR-USDT-SWAP", "hyperliquid": "MKR", "bybit": "MKRUSDT", "asterdex": "MKRUSDT", "name": "MKR", "symbol": "MKR", "logo": "https://cryptologos.cc/logos/maker-mkr-logo.png", "color": "#1AAB9B" },
            { "binance": "AAVEUSDT", "okx": "AAVE-USDT-SWAP", "hyperliquid": "AAVE", "bybit": "AAVEUSDT", "asterdex": "AAVEUSDT", "name": "AAVE", "symbol": "AAVE", "logo": "https://cryptologos.cc/logos/aave-aave-logo.png", "color": "#B6509E" },
            { "binance": "ALGOUSDT", "okx": "ALGO-USDT-SWAP", "hyperliquid": "ALGO", "bybit": "ALGOUSDT", "asterdex": "ALGOUSDT", "name": "ALGO", "symbol": "ALGO", "logo": "https://cryptologos.cc/logos/algorand-algo-logo.png", "color": "#000000" },
            { "binance": "EGLDUSDT", "okx": "EGLD-USDT-SWAP", "hyperliquid": "EGLD", "bybit": "EGLDUSDT", "asterdex": "EGLDUSDT", "name": "EGLD", "symbol": "EGLD", "logo": "https://cryptologos.cc/logos/elrond-egld-logo.png", "color": "#1B46C2" },
            { "binance": "SANDUSDT", "okx": "SAND-USDT-SWAP", "hyperliquid": "SAND", "bybit": "SANDUSDT", "asterdex": "SANDUSDT", "name": "SAND", "symbol": "SAND", "logo": "https://cryptologos.cc/logos/the-sandbox-sand-logo.png", "color": "#00ADEF" },
            { "binance": "AXSUSDT", "okx": "AXS-USDT-SWAP", "hyperliquid": "AXS", "bybit": "AXSUSDT", "asterdex": "AXSUSDT", "name": "AXS", "symbol": "AXS", "logo": "https://cryptologos.cc/logos/axie-infinity-axs-logo.png", "color": "#0055D5" },
            { "binance": "MANAUSDT", "okx": "MANA-USDT-SWAP", "hyperliquid": "MANA", "bybit": "MANAUSDT", "asterdex": "MANAUSDT", "name": "MANA", "symbol": "MANA", "logo": "https://cryptologos.cc/logos/decentraland-mana-logo.png", "color": "#FF2D55" },
            { "binance": "EOSUSDT", "okx": "EOS-USDT-SWAP", "hyperliquid": "EOS", "bybit": "EOSUSDT", "asterdex": "EOSUSDT", "name": "EOS", "symbol": "EOS", "logo": "https://cryptologos.cc/logos/eos-eos-logo.png", "color": "#000000" },
            { "binance": "FLOWUSDT", "okx": "FLOW-USDT-SWAP", "hyperliquid": "FLOW", "bybit": "FLOWUSDT", "asterdex": "FLOWUSDT", "name": "FLOW", "symbol": "FLOW", "logo": "https://cryptologos.cc/logos/flow-flow-logo.png", "color": "#00EF8B" },
            { "binance": "XTZUSDT", "okx": "XTZ-USDT-SWAP", "hyperliquid": "XTZ", "bybit": "XTZUSDT", "asterdex": "XTZUSDT", "name": "XTZ", "symbol": "XTZ", "logo": "https://cryptologos.cc/logos/tezos-xtz-logo.png", "color": "#2C7DF7" },
            { "binance": "KAVAUSDT", "okx": "KAVA-USDT-SWAP", "hyperliquid": "KAVA", "bybit": "KAVAUSDT", "asterdex": "KAVAUSDT", "name": "KAVA", "symbol": "KAVA", "logo": "https://cryptologos.cc/logos/kava-kava-logo.png", "color": "#FF564F" },
            { "binance": "MINAUSDT", "okx": "MINA-USDT-SWAP", "hyperliquid": "MINA", "bybit": "MINAUSDT", "asterdex": "MINAUSDT", "name": "MINA", "symbol": "MINA", "logo": "https://cryptologos.cc/logos/mina-mina-logo.png", "color": "#F06543" },
            { "binance": "QNTUSDT", "okx": "QNT-USDT-SWAP", "hyperliquid": "QNT", "bybit": "QNTUSDT", "asterdex": "QNTUSDT", "name": "QNT", "symbol": "QNT", "logo": "https://cryptologos.cc/logos/quant-qnt-logo.png", "color": "#000000" },
            { "binance": "GALAUSDT", "okx": "GALA-USDT-SWAP", "hyperliquid": "GALA", "bybit": "GALAUSDT", "asterdex": "GALAUSDT", "name": "GALA", "symbol": "GALA", "logo": "https://cryptologos.cc/logos/gala-gala-logo.png", "color": "#001E56" },
            { "binance": "CHZUSDT", "okx": "CHZ-USDT-SWAP", "hyperliquid": "CHZ", "bybit": "CHZUSDT", "asterdex": "CHZUSDT", "name": "CHZ", "symbol": "CHZ", "logo": "https://cryptologos.cc/logos/chiliz-chz-logo.png", "color": "#CD0124" },
            { "binance": "CRVUSDT", "okx": "CRV-USDT-SWAP", "hyperliquid": "CRV", "bybit": "CRVUSDT", "asterdex": "CRVUSDT", "name": "CRV", "symbol": "CRV", "logo": "https://cryptologos.cc/logos/curve-dao-token-crv-logo.png", "color": "#FF1C1C" },
            { "binance": "1INCHUSDT", "okx": "1INCH-USDT-SWAP", "hyperliquid": "1INCH", "bybit": "1INCHUSDT", "asterdex": "1INCHUSDT", "name": "1INCH", "symbol": "1INCH", "logo": "https://cryptologos.cc/logos/1inch-1inch-logo.png", "color": "#1B314F" },
            { "binance": "DYDXUSDT", "okx": "DYDX-USDT-SWAP", "hyperliquid": "DYDX", "bybit": "DYDXUSDT", "asterdex": "DYDXUSDT", "name": "DYDX", "symbol": "DYDX", "logo": "https://cryptologos.cc/logos/dydx-dydx-logo.png", "color": "#6966FF" },
            { "binance": "COMPUSDT", "okx": "COMP-USDT-SWAP", "hyperliquid": "COMP", "bybit": "COMPUSDT", "asterdex": "COMPUSDT", "name": "COMP", "symbol": "COMP", "logo": "https://cryptologos.cc/logos/compound-comp-logo.png", "color": "#00D395" },
            { "binance": "SNXUSDT", "okx": "SNX-USDT-SWAP", "hyperliquid": "SNX", "bybit": "SNXUSDT", "asterdex": "SNXUSDT", "name": "SNX", "symbol": "SNX", "logo": "https://cryptologos.cc/logos/synthetix-snx-logo.png", "color": "#00D1FF" },
            { "binance": "ZECUSDT", "okx": "ZEC-USDT-SWAP", "hyperliquid": "ZEC", "bybit": "ZECUSDT", "asterdex": "ZECUSDT", "name": "ZEC", "symbol": "ZEC", "logo": "https://cryptologos.cc/logos/zcash-zec-logo.png", "color": "#F4B728" },
            { "binance": "IOTAUSDT", "okx": "IOTA-USDT-SWAP", "hyperliquid": "IOTA", "bybit": "IOTAUSDT", "asterdex": "IOTAUSDT", "name": "IOTA", "symbol": "IOTA", "logo": "https://cryptologos.cc/logos/iota-miota-logo.png", "color": "#485760" },
            { "binance": "NEOUSDT", "okx": "NEO-USDT-SWAP", "hyperliquid": "NEO", "bybit": "NEOUSDT", "asterdex": "NEOUSDT", "name": "NEO", "symbol": "NEO", "logo": "https://cryptologos.cc/logos/neo-neo-logo.png", "color": "#00E599" },
            { "binance": "DASHUSDT", "okx": "DASH-USDT-SWAP", "hyperliquid": "DASH", "bybit": "DASHUSDT", "asterdex": "DASHUSDT", "name": "DASH", "symbol": "DASH", "logo": "https://cryptologos.cc/logos/dash-dash-logo.png", "color": "#008DE4" },
            { "binance": "BATUSDT", "okx": "BAT-USDT-SWAP", "hyperliquid": "BAT", "bybit": "BATUSDT", "asterdex": "BATUSDT", "name": "BAT", "symbol": "BAT", "logo": "https://cryptologos.cc/logos/basic-attention-token-bat-logo.png", "color": "#FF5000" },
            { "binance": "ENJUSDT", "okx": "ENJ-USDT-SWAP", "hyperliquid": "ENJ", "bybit": "ENJUSDT", "asterdex": "ENJUSDT", "name": "ENJ", "symbol": "ENJ", "logo": "https://cryptologos.cc/logos/enjin-coin-enj-logo.png", "color": "#7866D5" },
            { "binance": "ZILUSDT", "okx": "ZIL-USDT-SWAP", "hyperliquid": "ZIL", "bybit": "ZILUSDT", "asterdex": "ZILUSDT", "name": "ZIL", "symbol": "ZIL", "logo": "https://cryptologos.cc/logos/zilliqa-zil-logo.png", "color": "#49C1BF" },
            { "binance": "LRCUSDT", "okx": "LRC-USDT-SWAP", "hyperliquid": "LRC", "bybit": "LRCUSDT", "asterdex": "LRCUSDT", "name": "LRC", "symbol": "LRC", "logo": "https://cryptologos.cc/logos/loopring-lrc-logo.png", "color": "#1C60FF" },
            { "binance": "CVXUSDT", "okx": "CVX-USDT-SWAP", "hyperliquid": "CVX", "bybit": "CVXUSDT", "asterdex": "CVXUSDT", "name": "CVX", "symbol": "CVX", "logo": "https://cryptologos.cc/logos/convex-finance-cvx-logo.png", "color": "#FF5A5F" },
            { "binance": "ANKRUSDT", "okx": "ANKR-USDT-SWAP", "hyperliquid": "ANKR", "bybit": "ANKRUSDT", "asterdex": "ANKRUSDT", "name": "ANKR", "symbol": "ANKR", "logo": "https://cryptologos.cc/logos/ankr-ankr-logo.png", "color": "#356DF3" },
            { "binance": "ONEUSDT", "okx": "ONE-USDT-SWAP", "hyperliquid": "ONE", "bybit": "ONEUSDT", "asterdex": "ONEUSDT", "name": "ONE", "symbol": "ONE", "logo": "https://cryptologos.cc/logos/harmony-one-logo.png", "color": "#00AEE9" },
            { "binance": "HOTUSDT", "okx": "HOT-USDT-SWAP", "hyperliquid": "HOT", "bybit": "HOTUSDT", "asterdex": "HOTUSDT", "name": "HOT", "symbol": "HOT", "logo": "https://cryptologos.cc/logos/holo-hot-logo.png", "color": "#00A6E5" },
            { "binance": "RVNUSDT", "okx": "RVN-USDT-SWAP", "hyperliquid": "RVN", "bybit": "RVNUSDT", "asterdex": "RVNUSDT", "name": "RVN", "symbol": "RVN", "logo": "https://cryptologos.cc/logos/ravencoin-rvn-logo.png", "color": "#384149" },
            { "binance": "AUDIOUSDT", "okx": "AUDIO-USDT-SWAP", "hyperliquid": "AUDIO", "bybit": "AUDIOUSDT", "asterdex": "AUDIOUSDT", "name": "AUDIO", "symbol": "AUDIO", "logo": "https://cryptologos.cc/logos/audius-audio-logo.png", "color": "#CC00FF" },
            { "binance": "GLMRUSDT", "okx": "GLMR-USDT-SWAP", "hyperliquid": "GLMR", "bybit": "GLMRUSDT", "asterdex": "GLMRUSDT", "name": "GLMR", "symbol": "GLMR", "logo": "https://cryptologos.cc/logos/moonbeam-glmr-logo.png", "color": "#E1147B" },
            { "binance": "MOVRUSDT", "okx": "MOVR-USDT-SWAP", "hyperliquid": "MOVR", "bybit": "MOVRUSDT", "asterdex": "MOVRUSDT", "name": "MOVR", "symbol": "MOVR", "logo": "https://cryptologos.cc/logos/moonriver-movr-logo.png", "color": "#F2B705" },
            { "binance": "ROSEUSDT", "okx": "ROSE-USDT-SWAP", "hyperliquid": "ROSE", "bybit": "ROSEUSDT", "asterdex": "ROSEUSDT", "name": "ROSE", "symbol": "ROSE", "logo": "https://cryptologos.cc/logos/oasis-network-rose-logo.png", "color": "#0054F2" },
            { "binance": "OCEANUSDT", "okx": "OCEAN-USDT-SWAP", "hyperliquid": "OCEAN", "bybit": "OCEANUSDT", "asterdex": "OCEANUSDT", "name": "OCEAN", "symbol": "OCEAN", "logo": "https://cryptologos.cc/logos/ocean-protocol-ocean-logo.png", "color": "#141414" },
            { "binance": "KSMUSDT", "okx": "KSM-USDT-SWAP", "hyperliquid": "KSM", "bybit": "KSMUSDT", "asterdex": "KSMUSDT", "name": "KSM", "symbol": "KSM", "logo": "https://cryptologos.cc/logos/kusama-ksm-logo.png", "color": "#000000" },
            { "binance": "WAVESUSDT", "okx": "WAVES-USDT-SWAP", "hyperliquid": "WAVES", "bybit": "WAVESUSDT", "asterdex": "WAVESUSDT", "name": "WAVES", "symbol": "WAVES", "logo": "https://cryptologos.cc/logos/waves-waves-logo.png", "color": "#0155FF" }
        ]; { "binance": "INJUSDT", "okx": "INJ-USDT-SWAP", "hyperliquid": "INJ", "bybit": "INJUSDT", "asterdex": "INJUSDT", "name": "INJ", "symbol": "INJ", "logo": "https://assets.coingecko.com/coins/images/12882/small/Secondary_Symbol.png", "color": "#000000" },
        { "binance": "TIAUSDT", "okx": "TIA-USDT-SWAP", "hyperliquid": "TIA", "bybit": "TIAUSDT", "asterdex": "TIAUSDT", "name": "TIA", "symbol": "TIA", "logo": "https://assets.coingecko.com/coins/images/31967/small/tia.jpg", "color": "#000000" },
        { "binance": "SEIUSDT", "okx": "SEI-USDT-SWAP", "hyperliquid": "SEI", "bybit": "SEIUSDT", "asterdex": "SEIUSDT", "name": "SEI", "symbol": "SEI", "logo": "https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png", "color": "#000000" },
        { "binance": "LDOUSDT", "okx": "LDO-USDT-SWAP", "hyperliquid": "LDO", "bybit": "LDOUSDT", "asterdex": "LDOUSDT", "name": "LDO", "symbol": "LDO", "logo": "https://cryptologos.cc/logos/lido-dao-ldo-logo.png", "color": "#000000" },
        { "binance": "ETCUSDT", "okx": "ETC-USDT-SWAP", "hyperliquid": "ETC", "bybit": "ETCUSDT", "asterdex": "ETCUSDT", "name": "ETC", "symbol": "ETC", "logo": "https://cryptologos.cc/logos/ethereum-classic-etc-logo.png", "color": "#000000" },
        { "binance": "STXUSDT", "okx": "STX-USDT-SWAP", "hyperliquid": "STX", "bybit": "STXUSDT", "asterdex": "STXUSDT", "name": "STX", "symbol": "STX", "logo": "https://cryptologos.cc/logos/stacks-stx-logo.png", "color": "#000000" },
        { "binance": "IMXUSDT", "okx": "IMX-USDT-SWAP", "hyperliquid": "IMX", "bybit": "IMXUSDT", "asterdex": "IMXUSDT", "name": "IMX", "symbol": "IMX", "logo": "https://cryptologos.cc/logos/immutable-x-imx-logo.png", "color": "#000000" },
        { "binance": "AAVEUSDT", "okx": "AAVE-USDT-SWAP", "hyperliquid": "AAVE", "bybit": "AAVEUSDT", "asterdex": "AAVEUSDT", "name": "AAVE", "symbol": "AAVE", "logo": "https://cryptologos.cc/logos/aave-aave-logo.png", "color": "#000000" },
        { "binance": "WLDUSDT", "okx": "WLD-USDT-SWAP", "hyperliquid": "WLD", "bybit": "WLDUSDT", "asterdex": "WLDUSDT", "name": "WLD", "symbol": "WLD", "logo": "https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg", "color": "#000000" },
        // PEPE: Binance/Bybit=1000PEPE, Hyperliquid=kPEPE, OKX=PEPE (Fiyat farkı çok, OKX'i çıkarıyoruz şimdilik)
        { "binance": "1000PEPEUSDT", "okx": null, "hyperliquid": "kPEPE", "bybit": "1000PEPEUSDT", "asterdex": "1000PEPEUSDT", "name": "PEPE", "symbol": "PEPE", "logo": "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg", "color": "#000000" },
        // BONK: Binance/Bybit=1000BONK, Hyperliquid=kBONK
        { "binance": "1000BONKUSDT", "okx": null, "hyperliquid": "kBONK", "bybit": "1000BONKUSDT", "asterdex": "1000BONKUSDT", "name": "BONK", "symbol": "BONK", "logo": "https://assets.coingecko.com/coins/images/28600/small/bonk.jpg", "color": "#000000" },
        // SHIB: Binance/Bybit=1000SHIB, Hyperliquid=kSHIB
        { "binance": "1000SHIBUSDT", "okx": null, "hyperliquid": "kSHIB", "bybit": "1000SHIBUSDT", "asterdex": "1000SHIBUSDT", "name": "SHIB", "symbol": "SHIB", "logo": "https://cryptologos.cc/logos/shiba-inu-shib-logo.png", "color": "#000000" },
        // FLOKI: Binance/Bybit=1000FLOKI, Hyperliquid=kFLOKI
        { "binance": "1000FLOKIUSDT", "okx": null, "hyperliquid": "kFLOKI", "bybit": "1000FLOKIUSDT", "asterdex": "1000FLOKIUSDT", "name": "FLOKI", "symbol": "FLOKI", "logo": "https://assets.coingecko.com/coins/images/16746/small/FLOKI.png", "color": "#000000" },

        // New Coins
        { "binance": "TRXUSDT", "okx": "TRX-USDT-SWAP", "hyperliquid": "TRX", "bybit": "TRXUSDT", "asterdex": "TRXUSDT", "name": "TRX", "symbol": "TRX", "logo": "https://cryptologos.cc/logos/tron-trx-logo.png", "color": "#FF0013" },
        { "binance": "MATICUSDT", "okx": "MATIC-USDT-SWAP", "hyperliquid": "MATIC", "bybit": "MATICUSDT", "asterdex": "MATICUSDT", "name": "MATIC", "symbol": "MATIC", "logo": "https://cryptologos.cc/logos/polygon-matic-logo.png", "color": "#8247E5" },
        { "binance": "FTMUSDT", "okx": "FTM-USDT-SWAP", "hyperliquid": "FTM", "bybit": "FTMUSDT", "asterdex": "FTMUSDT", "name": "FTM", "symbol": "FTM", "logo": "https://cryptologos.cc/logos/fantom-ftm-logo.png", "color": "#13B5EC" },
        { "binance": "RUNEUSDT", "okx": "RUNE-USDT-SWAP", "hyperliquid": "RUNE", "bybit": "RUNEUSDT", "asterdex": "RUNEUSDT", "name": "RUNE", "symbol": "RUNE", "logo": "https://cryptologos.cc/logos/thorchain-rune-logo.png", "color": "#00CCBC" },
        { "binance": "SANDUSDT", "okx": "SAND-USDT-SWAP", "hyperliquid": "SAND", "bybit": "SANDUSDT", "asterdex": "SANDUSDT", "name": "SAND", "symbol": "SAND", "logo": "https://cryptologos.cc/logos/the-sandbox-sand-logo.png", "color": "#00ADEF" }
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
