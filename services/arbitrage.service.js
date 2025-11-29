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
            return opportunities.sort((a, b) => b.analysis.annualAPR - a.analysis.annualAPR);

        } catch (error) {
            console.error(`[${this.nameA}-${this.nameB}] Arbitrage calculation error:`, error.message);
            return [];
        }
    }

    getExchangeLogo(slug) {
        const logos = {
            binance: '/logos/binance.png',
            okx: '/logos/okx.png',
            hyperliquid: '/logos/hyperliquid.png' 
        };
        return logos[slug] || '';
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
            priceDifferencePnL,
            fundingDifferencePercent: netFundingRate8h,
            fundingPnL8h: fundingPnL8hDollar,
            annualFundingPnL,
            annualAPR,
            isOpportunity
        };
    }

    // Statik metod: Coin listesini dışarıdan almak için (3 borsada da ortak coinler)
    static getCoinList() {
        return [{"binance":"BTCUSDT","okx":"BTC-USDT-SWAP","hyperliquid":"BTC","name":"BTC","symbol":"BTC","logo":"https://cryptologos.cc/logos/bitcoin-btc-logo.png","color":"#F7931A"},{"binance":"ETHUSDT","okx":"ETH-USDT-SWAP","hyperliquid":"ETH","name":"ETH","symbol":"ETH","logo":"https://cryptologos.cc/logos/ethereum-eth-logo.png","color":"#627EEA"},{"binance":"SOLUSDT","okx":"SOL-USDT-SWAP","hyperliquid":"SOL","name":"SOL","symbol":"SOL","logo":"https://cryptologos.cc/logos/solana-sol-logo.png","color":"#14F195"},{"binance":"BNBUSDT","okx":"BNB-USDT-SWAP","hyperliquid":"BNB","name":"BNB","symbol":"BNB","logo":"https://cryptologos.cc/logos/bnb-bnb-logo.png","color":"#F3BA2F"},{"binance":"XRPUSDT","okx":"XRP-USDT-SWAP","hyperliquid":"XRP","name":"XRP","symbol":"XRP","logo":"https://cryptologos.cc/logos/xrp-xrp-logo.png","color":"#23292F"},{"binance":"DOGEUSDT","okx":"DOGE-USDT-SWAP","hyperliquid":"DOGE","name":"DOGE","symbol":"DOGE","logo":"https://cryptologos.cc/logos/dogecoin-doge-logo.png","color":"#C2A633"},{"binance":"ADAUSDT","okx":"ADA-USDT-SWAP","hyperliquid":"ADA","name":"ADA","symbol":"ADA","logo":"https://cryptologos.cc/logos/cardano-ada-logo.png","color":"#0033AD"},{"binance":"AVAXUSDT","okx":"AVAX-USDT-SWAP","hyperliquid":"AVAX","name":"AVAX","symbol":"AVAX","logo":"https://cryptologos.cc/logos/avalanche-avax-logo.png","color":"#E84142"},{"binance":"LINKUSDT","okx":"LINK-USDT-SWAP","hyperliquid":"LINK","name":"LINK","symbol":"LINK","logo":"https://cryptologos.cc/logos/chainlink-link-logo.png","color":"#2A5ADA"},{"binance":"SUIUSDT","okx":"SUI-USDT-SWAP","hyperliquid":"SUI","name":"SUI","symbol":"SUI","logo":"https://cryptologos.cc/logos/sui-sui-logo.png","color":"#4DA2FF"},{"binance":"LTCUSDT","okx":"LTC-USDT-SWAP","hyperliquid":"LTC","name":"LTC","symbol":"LTC","logo":"https://cryptologos.cc/logos/litecoin-ltc-logo.png","color":"#345D9D"},{"binance":"BCHUSDT","okx":"BCH-USDT-SWAP","hyperliquid":"BCH","name":"BCH","symbol":"BCH","logo":"https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png","color":"#0AC18E"},{"binance":"DOTUSDT","okx":"DOT-USDT-SWAP","hyperliquid":"DOT","name":"DOT","symbol":"DOT","logo":"https://cryptologos.cc/logos/polkadot-new-dot-logo.png","color":"#E6007A"},{"binance":"UNIUSDT","okx":"UNI-USDT-SWAP","hyperliquid":"UNI","name":"UNI","symbol":"UNI","logo":"https://cryptologos.cc/logos/uniswap-uni-logo.png","color":"#FF007A"},{"binance":"APTUSDT","okx":"APT-USDT-SWAP","hyperliquid":"APT","name":"APT","symbol":"APT","logo":"https://cryptologos.cc/logos/aptos-apt-logo.png","color":"#000000"},{"binance":"NEARUSDT","okx":"NEAR-USDT-SWAP","hyperliquid":"NEAR","name":"NEAR","symbol":"NEAR","logo":"https://cryptologos.cc/logos/near-protocol-near-logo.png","color":"#000000"},{"binance":"ARBUSDT","okx":"ARB-USDT-SWAP","hyperliquid":"ARB","name":"ARB","symbol":"ARB","logo":"https://cryptologos.cc/logos/arbitrum-arb-logo.png","color":"#2D374B"},{"binance":"FILUSDT","okx":"FIL-USDT-SWAP","hyperliquid":"FIL","name":"FIL","symbol":"FIL","logo":"https://cryptologos.cc/logos/filecoin-fil-logo.png","color":"#0090FF"},{"binance":"ATOMUSDT","okx":"ATOM-USDT-SWAP","hyperliquid":"ATOM","name":"ATOM","symbol":"ATOM","logo":"https://cryptologos.cc/logos/cosmos-atom-logo.png","color":"#2E3148"},{"binance":"OPUSDT","okx":"OP-USDT-SWAP","hyperliquid":"OP","name":"OP","symbol":"OP","logo":"https://cryptologos.cc/logos/optimism-ethereum-op-logo.png","color":"#FF0420"},{"binance":"INJUSDT","okx":"INJ-USDT-SWAP","hyperliquid":"INJ","name":"INJ","symbol":"INJ","logo":"https://cryptologos.cc/logos/injective-protocol-inj-logo.png","color":"#000000"},{"binance":"TIAUSDT","okx":"TIA-USDT-SWAP","hyperliquid":"TIA","name":"TIA","symbol":"TIA","logo":"https://cryptologos.cc/logos/celestia-tia-logo.png","color":"#000000"},{"binance":"SEIUSDT","okx":"SEI-USDT-SWAP","hyperliquid":"SEI","name":"SEI","symbol":"SEI","logo":"https://cryptologos.cc/logos/sei-sei-logo.png","color":"#000000"},{"binance":"LDOUSDT","okx":"LDO-USDT-SWAP","hyperliquid":"LDO","name":"LDO","symbol":"LDO","logo":"https://cryptologos.cc/logos/lido-dao-ldo-logo.png","color":"#000000"},{"binance":"ETCUSDT","okx":"ETC-USDT-SWAP","hyperliquid":"ETC","name":"ETC","symbol":"ETC","logo":"https://cryptologos.cc/logos/ethereum-classic-etc-logo.png","color":"#000000"},{"binance":"STXUSDT","okx":"STX-USDT-SWAP","hyperliquid":"STX","name":"STX","symbol":"STX","logo":"https://cryptologos.cc/logos/stacks-stx-logo.png","color":"#000000"},{"binance":"IMXUSDT","okx":"IMX-USDT-SWAP","hyperliquid":"IMX","name":"IMX","symbol":"IMX","logo":"https://cryptologos.cc/logos/immutable-x-imx-logo.png","color":"#000000"},{"binance":"AAVEUSDT","okx":"AAVE-USDT-SWAP","hyperliquid":"AAVE","name":"AAVE","symbol":"AAVE","logo":"https://cryptologos.cc/logos/aave-aave-logo.png","color":"#000000"},{"binance":"ORDIUSDT","okx":"ORDI-USDT-SWAP","hyperliquid":"ORDI","name":"ORDI","symbol":"ORDI","logo":"https://cryptologos.cc/logos/ordi-ordi-logo.png","color":"#000000"},{"binance":"WLDUSDT","okx":"WLD-USDT-SWAP","hyperliquid":"WLD","name":"WLD","symbol":"WLD","logo":"https://cryptologos.cc/logos/worldcoin-wld-logo.png","color":"#000000"},{"binance":"JUPUSDT","okx":"JUP-USDT-SWAP","hyperliquid":"JUP","name":"JUP","symbol":"JUP","logo":"https://cryptologos.cc/logos/jupiter-jup-logo.png","color":"#000000"},{"binance":"PYTHUSDT","okx":"PYTH-USDT-SWAP","hyperliquid":"PYTH","name":"PYTH","symbol":"PYTH","logo":"https://cryptologos.cc/logos/pyth-network-pyth-logo.png","color":"#000000"},{"binance":"ALGOUSDT","okx":"ALGO-USDT-SWAP","hyperliquid":"ALGO","name":"ALGO","symbol":"ALGO","logo":"https://cryptologos.cc/logos/algorand-algo-logo.png","color":"#000000"},{"binance":"MKRUSDT","okx":"MKR-USDT-SWAP","hyperliquid":"MKR","name":"MKR","symbol":"MKR","logo":"https://cryptologos.cc/logos/maker-mkr-logo.png","color":"#000000"},{"binance":"BLURUSDT","okx":"BLUR-USDT-SWAP","hyperliquid":"BLUR","name":"BLUR","symbol":"BLUR","logo":"https://cryptologos.cc/logos/blur-blur-logo.png","color":"#000000"},{"binance":"STRKUSDT","okx":"STRK-USDT-SWAP","hyperliquid":"STRK","name":"STRK","symbol":"STRK","logo":"https://cryptologos.cc/logos/starknet-strk-logo.png","color":"#000000"},{"binance":"DYDXUSDT","okx":"DYDX-USDT-SWAP","hyperliquid":"DYDX","name":"DYDX","symbol":"DYDX","logo":"https://cryptologos.cc/logos/dydx-dydx-logo.png","color":"#000000"},{"binance":"CRVUSDT","okx":"CRV-USDT-SWAP","hyperliquid":"CRV","name":"CRV","symbol":"CRV","logo":"https://cryptologos.cc/logos/curve-dao-token-crv-logo.png","color":"#000000"},{"binance":"SNXUSDT","okx":"SNX-USDT-SWAP","hyperliquid":"SNX","name":"SNX","symbol":"SNX","logo":"https://cryptologos.cc/logos/synthetix-snx-logo.png","color":"#000000"},{"binance":"SANDUSDT","okx":"SAND-USDT-SWAP","hyperliquid":"SAND","name":"SAND","symbol":"SAND","logo":"https://cryptologos.cc/logos/the-sandbox-sand-logo.png","color":"#000000"},{"binance":"APEUSDT","okx":"APE-USDT-SWAP","hyperliquid":"APE","name":"APE","symbol":"APE","logo":"https://cryptologos.cc/logos/apecoin-ape-logo.png","color":"#000000"},{"binance":"MINAUSDT","okx":"MINA-USDT-SWAP","hyperliquid":"MINA","name":"MINA","symbol":"MINA","logo":"https://cryptologos.cc/logos/mina-mina-logo.png","color":"#000000"},{"binance":"PENDLEUSDT","okx":"PENDLE-USDT-SWAP","hyperliquid":"PENDLE","name":"PENDLE","symbol":"PENDLE","logo":"https://cryptologos.cc/logos/pendle-pendle-logo.png","color":"#000000"},{"binance":"RENDERUSDT","okx":"RENDER-USDT-SWAP","hyperliquid":"RENDER","name":"RENDER","symbol":"RENDER","logo":"https://cryptologos.cc/logos/render-render-logo.png","color":"#000000"},{"binance":"ENSUSDT","okx":"ENS-USDT-SWAP","hyperliquid":"ENS","name":"ENS","symbol":"ENS","logo":"https://cryptologos.cc/logos/ethereum-name-service-ens-logo.png","color":"#000000"},{"binance":"PEPEUSDT","okx":"PEPE-USDT-SWAP","hyperliquid":"PEPE","name":"PEPE","symbol":"PEPE","logo":"https://cryptologos.cc/logos/pepe-pepe-logo.png","color":"#000000"},{"binance":"WIFUSDT","okx":"WIF-USDT-SWAP","hyperliquid":"WIF","name":"WIF","symbol":"WIF","logo":"https://cryptologos.cc/logos/wif-wif-logo.png","color":"#000000"},{"binance":"BONKUSDT","okx":"BONK-USDT-SWAP","hyperliquid":"BONK","name":"BONK","symbol":"BONK","logo":"https://cryptologos.cc/logos/bonk-bonk-logo.png","color":"#000000"},{"binance":"POPCATUSDT","okx":"POPCAT-USDT-SWAP","hyperliquid":"POPCAT","name":"POPCAT","symbol":"POPCAT","logo":"https://cryptologos.cc/logos/popcat-popcat-logo.png","color":"#000000"},{"binance":"ICPUSDT","okx":"ICP-USDT-SWAP","hyperliquid":"ICP","name":"ICP","symbol":"ICP","logo":"https://cryptologos.cc/logos/icp-icp-logo.png","color":"#000000"}];
    }

    getTopCoins() {
        return ArbitrageService.getCoinList();
    }
}

module.exports = ArbitrageService;
