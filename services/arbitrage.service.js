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

        // YENİ MANTIK: 100$ İşlem Büyüklüğü
        const tradeSize = 100;

        // 1. Fiyat Farkı (Tek seferlik kâr/zarar)
        // Eğer Long A, Short B ise: A ucuz, B pahalı olmalı.
        // Price Diff % = (MarkB - MarkA) / MarkA
        // PnL = PriceDiff% * TradeSize
        // Örn: A=100, B=101. Fark %1. 100$'lık işlemde 1$ kâr (teorik kapanışta)
        const priceDiffPercent = ((markB - markA) / markA); // Ondalık (0.01 = %1)
        const priceDiffPnL = priceDiffPercent * tradeSize;

        // 2. Funding Kârı (8 saatlik)
        // Long A: Funding A öder/alır (-fundingA)
        // Short B: Funding B öder/alır (+fundingB)
        // Net Rate = FundingB - FundingA
        const netFundingRate8h = fundingB - fundingA; // Ondalık (0.0001 = %0.01)
        const fundingPnL8h = netFundingRate8h * tradeSize;

        // 3. Yıllık Tahmini Getiri (APR) - Sadece Funding üzerinden
        // Günde 3 ödeme * 365 gün
        const annualFundingPnL = fundingPnL8h * 3 * 365;
        const annualAPR = netFundingRate8h * 3 * 365 * 100; // Yüzdesel

        // Fırsat Eşiği: 8 saatlik funding kârı pozitifse veya fiyat farkı çok iyiyse
        const isOpportunity = fundingPnL8h > 0.01 || priceDiffPnL > 0.5;

        return {
            strategy,
            tradeSize,
            priceDifferencePercent: priceDiffPercent * 100,
            priceDifferencePnL: priceDiffPnL,
            fundingDifferencePercent: netFundingRate8h * 100,
            fundingPnL8h,
            annualFundingPnL,
            annualAPR,
            isOpportunity
        };
    }

    getExchangeLogo(slug) {
        const logos = {
            binance: '/logos/binance.svg',
            okx: '/logos/okx.svg',
            hyperliquid: '/logos/hyperliquid.svg'
        };
        return logos[slug] || '';
    }

    // Statik metod: Coin listesini dışarıdan almak için
    static getCoinList() {
        return [
            {
                "binance": "BTCUSDT",
                "okx": "BTC-USDT-SWAP",
                "hyperliquid": "BTC",
                "name": "BTC",
                "symbol": "BTC",
                "logo": "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
                "color": "#F7931A"
            },
            {
                "binance": "ETHUSDT",
                "okx": "ETH-USDT-SWAP",
                "hyperliquid": "ETH",
                "name": "ETH",
                "symbol": "ETH",
                "logo": "https://cryptologos.cc/logos/ethereum-eth-logo.png",
                "color": "#627EEA"
            },
            {
                "binance": "SOLUSDT",
                "okx": "SOL-USDT-SWAP",
                "hyperliquid": "SOL",
                "name": "SOL",
                "symbol": "SOL",
                "logo": "https://cryptologos.cc/logos/solana-sol-logo.png",
                "color": "#14F195"
            },
            {
                "binance": "BNBUSDT",
                "okx": "BNB-USDT-SWAP",
                "hyperliquid": "BNB",
                "name": "BNB",
                "symbol": "BNB",
                "logo": "https://cryptologos.cc/logos/bnb-bnb-logo.png",
                "color": "#F3BA2F"
            },
            {
                "binance": "XRPUSDT",
                "okx": "XRP-USDT-SWAP",
                "hyperliquid": "XRP",
                "name": "XRP",
                "symbol": "XRP",
                "logo": "https://cryptologos.cc/logos/xrp-xrp-logo.png",
                "color": "#23292F"
            },
            {
                "binance": "DOGEUSDT",
                "okx": "DOGE-USDT-SWAP",
                "hyperliquid": "DOGE",
                "name": "DOGE",
                "symbol": "DOGE",
                "logo": "https://cryptologos.cc/logos/dogecoin-doge-logo.png",
                "color": "#C2A633"
            },
            {
                "binance": "ADAUSDT",
                "okx": "ADA-USDT-SWAP",
                "hyperliquid": "ADA",
                "name": "ADA",
                "symbol": "ADA",
                "logo": "https://cryptologos.cc/logos/cardano-ada-logo.png",
                "color": "#0033AD"
            },
            {
                "binance": "AVAXUSDT",
                "okx": "AVAX-USDT-SWAP",
                "hyperliquid": "AVAX",
                "name": "AVAX",
                "symbol": "AVAX",
                "logo": "https://cryptologos.cc/logos/avalanche-avax-logo.png",
                "color": "#E84142"
            },
            {
                "binance": "LINKUSDT",
                "okx": "LINK-USDT-SWAP",
                "hyperliquid": "LINK",
                "name": "LINK",
                "symbol": "LINK",
                "logo": "https://cryptologos.cc/logos/chainlink-link-logo.png",
                "color": "#2A5ADA"
            },
            {
                "binance": "SUIUSDT",
                "okx": "SUI-USDT-SWAP",
                "hyperliquid": "SUI",
                "name": "SUI",
                "symbol": "SUI",
                "logo": "https://cryptologos.cc/logos/sui-sui-logo.png",
                "color": "#4DA2FF"
            },
            {
                "binance": "LTCUSDT",
                "okx": "LTC-USDT-SWAP",
                "hyperliquid": "LTC",
                "name": "LTC",
                "symbol": "LTC",
                "logo": "https://cryptologos.cc/logos/litecoin-ltc-logo.png",
                "color": "#345D9D"
            },
            {
                "binance": "BCHUSDT",
                "okx": "BCH-USDT-SWAP",
                "hyperliquid": "BCH",
                "name": "BCH",
                "symbol": "BCH",
                "logo": "https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png",
                "color": "#0AC18E"
            },
            {
                "binance": "DOTUSDT",
                "okx": "DOT-USDT-SWAP",
                "hyperliquid": "DOT",
                "name": "DOT",
                "symbol": "DOT",
                "logo": "https://cryptologos.cc/logos/polkadot-new-dot-logo.png",
                "color": "#E6007A"
            },
            {
                "binance": "UNIUSDT",
                "okx": "UNI-USDT-SWAP",
                "hyperliquid": "UNI",
                "name": "UNI",
                "symbol": "UNI",
                "logo": "https://cryptologos.cc/logos/uniswap-uni-logo.png",
                "color": "#FF007A"
            },
            {
                "binance": "APTUSDT",
                "okx": "APT-USDT-SWAP",
                "hyperliquid": "APT",
                "name": "APT",
                "symbol": "APT",
                "logo": "https://cryptologos.cc/logos/aptos-apt-logo.png",
                "color": "#000000"
            },
            {
                "binance": "NEARUSDT",
                "okx": "NEAR-USDT-SWAP",
                "hyperliquid": "NEAR",
                "name": "NEAR",
                "symbol": "NEAR",
                "logo": "https://cryptologos.cc/logos/near-protocol-near-logo.png",
                "color": "#000000"
            },
            {
                "binance": "ARBUSDT",
                "okx": "ARB-USDT-SWAP",
                "hyperliquid": "ARB",
                "name": "ARB",
                "symbol": "ARB",
                "logo": "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
                "color": "#2D374B"
            },
            {
                "binance": "FILUSDT",
                "okx": "FIL-USDT-SWAP",
                "hyperliquid": "FIL",
                "name": "FIL",
                "symbol": "FIL",
                "logo": "https://cryptologos.cc/logos/filecoin-fil-logo.png",
                "color": "#0090FF"
            },
            {
                "binance": "ATOMUSDT",
                "okx": "ATOM-USDT-SWAP",
                "hyperliquid": "ATOM",
                "name": "ATOM",
                "symbol": "ATOM",
                "logo": "https://cryptologos.cc/logos/cosmos-atom-logo.png",
                "color": "#2E3148"
            },
            {
                "binance": "OPUSDT",
                "okx": "OP-USDT-SWAP",
                "hyperliquid": "OP",
                "name": "OP",
                "symbol": "OP",
                "logo": "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png",
                "color": "#FF0420"
            },
            {
                "binance": "INJUSDT",
                "okx": "INJ-USDT-SWAP",
                "hyperliquid": "INJ",
                "name": "INJ",
                "symbol": "INJ",
                "logo": "https://cryptologos.cc/logos/injective-protocol-inj-logo.png",
                "color": "#000000"
            },
            {
                "binance": "TIAUSDT",
                "okx": "TIA-USDT-SWAP",
                "hyperliquid": "TIA",
                "name": "TIA",
                "symbol": "TIA",
                "logo": "https://cryptologos.cc/logos/celestia-tia-logo.png",
                "color": "#000000"
            },
            {
                "binance": "SEIUSDT",
                "okx": "SEI-USDT-SWAP",
                "hyperliquid": "SEI",
                "name": "SEI",
                "symbol": "SEI",
                "logo": "https://cryptologos.cc/logos/sei-sei-logo.png",
                "color": "#000000"
            },
            {
                "binance": "RUNEUSDT",
                "okx": "RUNE-USDT-SWAP",
                "hyperliquid": "RUNE",
                "name": "RUNE",
                "symbol": "RUNE",
                "logo": "https://cryptologos.cc/logos/thorchain-rune-logo.png",
                "color": "#000000"
            },
            {
                "binance": "LDOUSEDT",
                "okx": "LDO-USDT-SWAP",
                "hyperliquid": "LDO",
                "name": "LDO",
                "symbol": "LDO",
                "logo": "https://cryptologos.cc/logos/lido-dao-ldo-logo.png",
                "color": "#000000"
            },
            {
                "binance": "ETCUSDT",
                "okx": "ETC-USDT-SWAP",
                "hyperliquid": "ETC",
                "name": "ETC",
                "symbol": "ETC",
                "logo": "https://cryptologos.cc/logos/ethereum-classic-etc-logo.png",
                "color": "#000000"
            },
            {
                "binance": "STXUSDT",
                "okx": "STX-USDT-SWAP",
                "hyperliquid": "STX",
                "name": "STX",
                "symbol": "STX",
                "logo": "https://cryptologos.cc/logos/stacks-stx-logo.png",
                "color": "#000000"
            },
            {
                "binance": "IMXUSDT",
                "okx": "IMX-USDT-SWAP",
                "hyperliquid": "IMX",
                "name": "IMX",
                "symbol": "IMX",
                "logo": "https://cryptologos.cc/logos/immutable-x-imx-logo.png",
                "color": "#000000"
            },
            {
                "binance": "FTMUSDT",
                "okx": "FTM-USDT-SWAP",
                "hyperliquid": "FTM",
                "name": "FTM",
                "symbol": "FTM",
                "logo": "https://cryptologos.cc/logos/fantom-ftm-logo.png",
                "color": "#000000"
            },
            {
                "binance": "AAVEUSDT",
                "okx": "AAVE-USDT-SWAP",
                "hyperliquid": "AAVE",
                "name": "AAVE",
                "symbol": "AAVE",
                "logo": "https://cryptologos.cc/logos/aave-aave-logo.png",
                "color": "#000000"
            },
            {
                "binance": "ORDIUSDT",
                "okx": "ORDI-USDT-SWAP",
                "hyperliquid": "ORDI",
                "name": "ORDI",
                "symbol": "ORDI",
                "logo": "https://cryptologos.cc/logos/ordi-ordi-logo.png",
                "color": "#000000"
            },
            {
                "binance": "WLDUSDT",
                "okx": "WLD-USDT-SWAP",
                "hyperliquid": "WLD",
                "name": "WLD",
                "symbol": "WLD",
                "logo": "https://cryptologos.cc/logos/worldcoin-wld-logo.png",
                "color": "#000000"
            },
            {
                "binance": "FETUSDT",
                "okx": "FET-USDT-SWAP",
                "hyperliquid": "FET",
                "name": "FET",
                "symbol": "FET",
                "logo": "https://cryptologos.cc/logos/fetch-ai-fet-logo.png",
                "color": "#000000"
            },
            {
                "binance": "JUPUSDT",
                "okx": "JUP-USDT-SWAP",
                "hyperliquid": "JUP",
                "name": "JUP",
                "symbol": "JUP",
                "logo": "https://cryptologos.cc/logos/jupiter-jup-logo.png",
                "color": "#000000"
            },
            {
                "binance": "GRTUSDT",
                "okx": "GRT-USDT-SWAP",
                "hyperliquid": "GRT",
                "name": "GRT",
                "symbol": "GRT",
                "logo": "https://cryptologos.cc/logos/the-graph-grt-logo.png",
                "color": "#000000"
            },
            {
                "binance": "PYTHUSDT",
                "okx": "PYTH-USDT-SWAP",
                "hyperliquid": "PYTH",
                "name": "PYTH",
                "symbol": "PYTH",
                "logo": "https://cryptologos.cc/logos/pyth-network-pyth-logo.png",
                "color": "#000000"
            },
            {
                "binance": "ALGOUSDT",
                "okx": "ALGO-USDT-SWAP",
                "hyperliquid": "ALGO",
                "name": "ALGO",
                "symbol": "ALGO",
                "logo": "https://cryptologos.cc/logos/algorand-algo-logo.png",
                "color": "#000000"
            },
            {
                "binance": "MKRUSDT",
                "okx": "MKR-USDT-SWAP",
                "hyperliquid": "MKR",
                "name": "MKR",
                "symbol": "MKR",
                "logo": "https://cryptologos.cc/logos/maker-mkr-logo.png",
                "color": "#000000"
            },
            {
                "binance": "BLURUSDT",
                "okx": "BLUR-USDT-SWAP",
                "hyperliquid": "BLUR",
                "name": "BLUR",
                "symbol": "BLUR",
                "logo": "https://cryptologos.cc/logos/blur-blur-logo.png",
                "color": "#000000"
            },
            {
                "binance": "STRKUSDT",
                "okx": "STRK-USDT-SWAP",
                "hyperliquid": "STRK",
                "name": "STRK",
                "symbol": "STRK",
                "logo": "https://cryptologos.cc/logos/starknet-strk-logo.png",
                "color": "#000000"
            },
            {
                "binance": "DYDXUSDT",
                "okx": "DYDX-USDT-SWAP",
                "hyperliquid": "DYDX",
                "name": "DYDX",
                "symbol": "DYDX",
                "logo": "https://cryptologos.cc/logos/dydx-dydx-logo.png",
                "color": "#000000"
            },
            {
                "binance": "CRVUSDT",
                "okx": "CRV-USDT-SWAP",
                "hyperliquid": "CRV",
                "name": "CRV",
                "symbol": "CRV",
                "logo": "https://cryptologos.cc/logos/curve-dao-token-crv-logo.png",
                "color": "#000000"
            },
            {
                "binance": "SNXUSDT",
                "okx": "SNX-USDT-SWAP",
                "hyperliquid": "SNX",
                "name": "SNX",
                "symbol": "SNX",
                "logo": "https://cryptologos.cc/logos/synthetix-snx-logo.png",
                "color": "#000000"
            },
            {
                "binance": "SANDUSDT",
                "okx": "SAND-USDT-SWAP",
                "hyperliquid": "SAND",
                "name": "SAND",
                "symbol": "SAND",
                "logo": "https://cryptologos.cc/logos/the-sandbox-sand-logo.png",
                "color": "#000000"
            },
            {
                "binance": "MANAUSDT",
                "okx": "MANA-USDT-SWAP",
                "hyperliquid": "MANA",
                "name": "MANA",
                "symbol": "MANA",
                "logo": "https://cryptologos.cc/logos/decentraland-mana-logo.png",
                "color": "#000000"
            },
            {
                "binance": "AXSUSDT",
                "okx": "AXS-USDT-SWAP",
                "hyperliquid": "AXS",
                "name": "AXS",
                "symbol": "AXS",
                "logo": "https://cryptologos.cc/logos/axie-infinity-axs-logo.png",
                "color": "#000000"
            },
            {
                "binance": "APEUSDT",
                "okx": "APE-USDT-SWAP",
                "hyperliquid": "APE",
                "name": "APE",
                "symbol": "APE",
                "logo": "https://cryptologos.cc/logos/apecoin-ape-logo.png",
                "color": "#000000"
            },
            {
                "binance": "EGLDUSDT",
                "okx": "EGLD-USDT-SWAP",
                "hyperliquid": "EGLD",
                "name": "EGLD",
                "symbol": "EGLD",
                "logo": "https://cryptologos.cc/logos/multiversx-egld-logo.png",
                "color": "#000000"
            },
            {
                "binance": "THETAUSDT",
                "okx": "THETA-USDT-SWAP",
                "hyperliquid": "THETA",
                "name": "THETA",
                "symbol": "THETA",
                "logo": "https://cryptologos.cc/logos/theta-network-theta-logo.png",
                "color": "#000000"
            },
            {
                "binance": "MINAUSDT",
                "okx": "MINA-USDT-SWAP",
                "hyperliquid": "MINA",
                "name": "MINA",
                "symbol": "MINA",
                "logo": "https://cryptologos.cc/logos/mina-mina-logo.png",
                "color": "#000000"
            }
        ];
    }

    getTopCoins() {
        return ArbitrageService.getCoinList();
    }
}

module.exports = ArbitrageService;
