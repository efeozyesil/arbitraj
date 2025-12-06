// Funding Intervals for Each Exchange (in hours)
const FUNDING_INTERVALS = {
    binance: 8,      // 00:00, 08:00, 16:00 UTC
    okx: 8,          // 00:00, 08:00, 16:00 UTC
    bybit: 8,        // 00:00, 08:00, 16:00 UTC
    hyperliquid: 1,  // Every hour
    asterdex: 8      // Assumed 8 hours
};

// Get next funding time for each exchange
function getNextFundingTime(exchange) {
    const now = new Date();
    const interval = FUNDING_INTERVALS[exchange] || 8;

    if (interval === 1) {
        // Next full hour
        const next = new Date(now);
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        return next;
    } else {
        // Next 8-hour mark (00:00, 08:00, 16:00 UTC)
        const next = new Date(now);
        const currentHour = next.getUTCHours();
        const nextFundingHour = Math.ceil(currentHour / 8) * 8;
        next.setUTCHours(nextFundingHour, 0, 0, 0);
        if (nextFundingHour >= 24) {
            next.setUTCDate(next.getUTCDate() + 1);
            next.setUTCHours(0, 0, 0, 0);
        }
        return next;
    }
}

// Get hours until next funding
function getHoursUntilFunding(exchange) {
    const now = new Date();
    const next = getNextFundingTime(exchange);
    return (next - now) / (1000 * 60 * 60);
}

const metadataService = require('./metadata.service');

// Helper to estimate funding interval based on next funding hour (UTC)
function estimateFundingInterval(nextTime) {
    if (!nextTime) return 8; // Default fallback

    const now = Date.now();
    const diffHours = (nextTime - now) / 3600000;

    // If more than 4h away, it's likely 8h
    if (diffHours > 4.1) return 8;
    // If more than 1.1h away, it cannot be 1h. Must be 2h, 4h, or 8h.

    const date = new Date(nextTime);
    const hour = date.getUTCHours();

    // If hour is odd (1, 3, 5...), it implies 1h interval (cannot be 2h, 4h, 8h which are even)
    if (hour % 2 !== 0) return 1;

    // If divisible by 2 but not 4 (2, 6, 10...), likely 2h
    if (hour % 4 !== 0) return 2;

    // If divisible by 4 but not 8 (4, 12, 20...), likely 4h
    if (hour % 8 !== 0) return 4;

    return 8;
}

// Calculate detailed funding analysis
function calculateDetailedFunding(exchangeA, exchangeB, dataA, dataB, strategy, tradeSize = 100) {
    const fundingRateA = dataA.fundingRate; // % per interval
    const fundingRateB = dataB.fundingRate; // % per interval

    // Use nextFundingTime from WebSocket
    const nextFundingTimeA = dataA.nextFundingTime ? new Date(dataA.nextFundingTime) : new Date();
    const nextFundingTimeB = dataB.nextFundingTime ? new Date(dataB.nextFundingTime) : new Date();

    // PRIORITY: 1. Metadata Service (API), 2. WebSocket Data, 3. Estimate
    const intervalA = metadataService.getInterval(exchangeA, dataA.symbol)
        || dataA.fundingInterval
        || estimateFundingInterval(nextFundingTimeA);

    const intervalB = metadataService.getInterval(exchangeB, dataB.symbol)
        || dataB.fundingInterval
        || estimateFundingInterval(nextFundingTimeB);

    const now = new Date();
    const hoursUntilNextA = Math.max(0, (nextFundingTimeA - now) / (1000 * 60 * 60));
    const hoursUntilNextB = Math.max(0, (nextFundingTimeB - now) / (1000 * 60 * 60));

    // Calculate minutes and hours for display
    const minutesUntilNextA = Math.floor((hoursUntilNextA * 60) % 60);
    const hoursOnlyA = Math.floor(hoursUntilNextA);
    const minutesUntilNextB = Math.floor((hoursUntilNextB * 60) % 60);
    const hoursOnlyB = Math.floor(hoursUntilNextB);

    // Determine which side pays/receives
    let receiveFromA, payToA, receiveFromB, payToB;

    if (strategy === 'LONG_A_SHORT_B') {
        payToA = fundingRateA > 0;
        receiveFromA = fundingRateA < 0;
        receiveFromB = fundingRateB > 0;
        payToB = fundingRateB < 0;
    } else {
        receiveFromA = fundingRateA > 0;
        payToA = fundingRateA < 0;
        payToB = fundingRateB > 0;
        receiveFromB = fundingRateB < 0;
    }

    // Calculate funding amounts
    const fundingAmountA = (Math.abs(fundingRateA) / 100) * tradeSize;
    const fundingAmountB = (Math.abs(fundingRateB) / 100) * tradeSize;

    // Net funding per interval
    const netFundingPerInterval = strategy === 'LONG_A_SHORT_B'
        ? -fundingRateA + fundingRateB
        : fundingRateA - fundingRateB;

    // Calculate when we'll receive first funding from both sides
    const firstDualFundingHours = Math.max(hoursUntilNextA, hoursUntilNextB);

    // Calculate total funding in first dual collection
    const collectionsInFirstPeriod = Math.min(
        Math.ceil(firstDualFundingHours / intervalA),
        Math.ceil(firstDualFundingHours / intervalB)
    );

    // Funding collected in first period
    const fundingInFirstPeriod = (netFundingPerInterval / 100) * tradeSize * collectionsInFirstPeriod;

    // Annualized funding
    const fundingsPerYear = (365 * 24) / Math.max(intervalA, intervalB);
    const annualFunding = (netFundingPerInterval / 100) * tradeSize * fundingsPerYear;
    const annualAPR = netFundingPerInterval * fundingsPerYear;

    return {
        exchangeA: {
            name: exchangeA,
            fundingRate: fundingRateA,
            fundingInterval: intervalA,
            hoursUntilNext: hoursUntilNextA,
            hoursOnly: hoursOnlyA,
            minutesOnly: minutesUntilNextA,
            nextFundingTime: nextFundingTimeA,
            fundingAmount: fundingAmountA,
            isPaying: payToA,
            isReceiving: receiveFromA
        },
        exchangeB: {
            name: exchangeB,
            fundingRate: fundingRateB,
            fundingInterval: intervalB,
            hoursUntilNext: hoursUntilNextB,
            hoursOnly: hoursOnlyB,
            minutesOnly: minutesUntilNextB,
            nextFundingTime: nextFundingTimeB,
            fundingAmount: fundingAmountB,
            isPaying: payToB,
            isReceiving: receiveFromB
        },
        netFundingRate: netFundingPerInterval,
        firstDualFundingHours: firstDualFundingHours,
        fundingInFirstPeriod: fundingInFirstPeriod,
        annualFunding: annualFunding,
        annualAPR: annualAPR,
        fundingsPerYear: fundingsPerYear
    };
}

module.exports = {
    FUNDING_INTERVALS,
    getNextFundingTime,
    getHoursUntilFunding,
    calculateDetailedFunding
};
