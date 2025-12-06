const BaseWebSocket = require('./base.ws');

class OKXWebSocket extends BaseWebSocket {
    constructor(symbols) {
        super('OKX', 'wss://ws.okx.com:8443/ws/v5/public');
        this.symbols = symbols || [];
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send('ping');
            }
        }, 20000); // 20s ping
    }

    onOpen() {
        const args = [];
        this.symbols.forEach(symbol => {
            args.push({ channel: 'mark-price', instId: symbol });
            args.push({ channel: 'funding-rate', instId: symbol });
        });

        const msg = {
            op: 'subscribe',
            args: args
        };
        this.ws.send(JSON.stringify(msg));
    }

    onMessage(data) {
        let dataStr = '';
        try {
            dataStr = data.toString();
            // Pong mesajı bazen farklı formatta gelebilir, içinde 'pong' geçiyorsa yut
            if (dataStr.includes('pong')) return;

            const msg = JSON.parse(dataStr);
            if (!msg.data) return;

            const item = msg.data[0];
            const symbol = item.instId;

            if (!this.data[symbol]) {
                this.data[symbol] = { symbol: symbol };
            }

            if (msg.arg.channel === 'mark-price') {
                this.data[symbol].markPrice = parseFloat(item.markPx);
                this.data[symbol].timestamp = parseInt(item.ts);
            } else if (msg.arg.channel === 'funding-rate') {
                this.data[symbol].fundingRate = parseFloat(item.fundingRate) * 100; // Convert to percentage
                this.data[symbol].nextFundingTime = parseInt(item.nextFundingTime);
            }
        } catch (error) {
            // Sadece pong olmayan ve JSON parse edilemeyen hataları sessizce geç
            // console.debug(`[OKX] Non-JSON message received: ${dataStr.substring(0, 20)}...`);
        }
    }
}

module.exports = OKXWebSocket;
