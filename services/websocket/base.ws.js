const WebSocket = require('ws');
const EventEmitter = require('events');

class BaseWebSocket extends EventEmitter {
    constructor(name, url) {
        super();
        this.name = name;
        this.url = url;
        this.ws = null;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.data = {}; // Cache for storing latest data
    }

    connect() {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;

        this.isConnecting = true;
        console.log(`[${this.name}] Connecting to WebSocket...`);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                console.log(`[${this.name}] Connected`);
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.startPing();
                this.onOpen();
            });

            this.ws.on('message', (data) => {
                try {
                    this.onMessage(data);
                } catch (error) {
                    console.error(`[${this.name}] Message parsing error:`, error.message);
                }
            });

            this.ws.on('close', () => {
                console.log(`[${this.name}] Disconnected`);
                this.cleanup();
                this.reconnect();
            });

            this.ws.on('error', (error) => {
                console.error(`[${this.name}] Error:`, error.message);
                this.ws.close();
            });

        } catch (error) {
            console.error(`[${this.name}] Connection error:`, error.message);
            this.reconnect();
        }
    }

    reconnect() {
        this.isConnecting = false;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Max 30s delay
        console.log(`[${this.name}] Reconnecting in ${delay}ms...`);

        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    cleanup() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    startPing() {
        // Override in child class if needed
    }

    onOpen() {
        // Override in child class
    }

    onMessage(data) {
        // Override in child class
    }

    getData(symbol) {
        return this.data[symbol];
    }

    getAllData() {
        return this.data;
    }
}

module.exports = BaseWebSocket;
