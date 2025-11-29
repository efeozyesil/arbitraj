const BaseWebSocket = require('./base.ws');

class BinanceWebSocket extends BaseWebSocket {
    constructor() {
        super('Binance', 'wss://fstream.binance.com/ws/!markPrice@arr');
    }

    onMessage(data) {
        const messages = JSON.parse(data);
        if (!Array.isArray(messages)) return;

        messages.forEach(msg => {
            // msg.s: Symbol
            // msg.p: Mark Price
            // msg.r: Funding Rate
            // msg.T: Next Funding Time

            this.data[msg.s] = {
                symbol: msg.s,
                markPrice: parseFloat(msg.p),
                fundingRate: parseFloat(msg.r) * 100, // Convert to percentage
                nextFundingTime: msg.T,
                timestamp: Date.now()
            };
        });
    }
}

module.exports = BinanceWebSocket;
