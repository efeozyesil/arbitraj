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

// Calculate detailed funding analysis
function calculateDetailedFunding(exchangeA, exchangeB, dataA, dataB, strategy, tradeSize = 100) {
    const slugA = exchangeA.toLowerCase();
    const slugB = exchangeB.toLowerCase();

    const fundingRateA = dataA.fundingRate; // % per interval
    const fundingRateB = dataB.fundingRate; // % per interval

    const intervalA = FUNDING_INTERVALS[slugA] || 8;
    const intervalB = FUNDING_INTERVALS[slugB] || 8;

    const hoursUntilNextA = getHoursUntilFunding(slugA);
    const hoursUntilNextB = getHoursUntilFunding(slugB);

    // Determine which side pays/receives
    let receiveFromA, payToA, receiveFromB, payToB;

    if (strategy === 'LONG_A_SHORT_B') {
        // Long A: pays funding if positive
        // Short B: receives funding if positive
        payToA = fundingRateA > 0;
        receiveFromA = fundingRateA < 0;
        receiveFromB = fundingRateB > 0;
        payToB = fundingRateB < 0;
    } else {
        // Short A: receives funding if positive
        // Long B: pays funding if positive
        receiveFromA = fundingRateA > 0;
        payToA = fundingRateA < 0;
        payToB = fundingRateB > 0;
        receiveFromB = fundingRateB < 0;
    }

    // Calculate funding amounts
    const fundingAmountA = (Math.abs(fundingRateA) / 100) * tradeSize;
    const fundingAmountB = (Math.abs(fundingRateB) / 100) * tradeSize;

    // Net funding per interval (normalized to 8h for comparison)
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

    // Funding collected in first period (until both have paid at least once)
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
            nextFundingTime: getNextFundingTime(slugA),
            fundingAmount: fundingAmountA,
            isPaying: payToA,
            isReceiving: receiveFromA
        },
        exchangeB: {
            name: exchangeB,
            fundingRate: fundingRateB,
            fundingInterval: intervalB,
            hoursUntilNext: hoursUntilNextB,
            nextFundingTime: getNextFundingTime(slugB),
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
