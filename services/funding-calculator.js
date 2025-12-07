const metadataService = require('./metadata.service');

// API'den yanıt alınamazsa kullanılacak güvenli tahminci
function estimateFundingInterval(nextTime) {
    if (!nextTime) return 8; // Standart 8 saat
    const now = Date.now();
    const diffHours = (new Date(nextTime) - now) / 3600000;

    // Eğer 4 saatten fazlaysa kesin 8 saattir
    if (diffHours > 4.1) return 8;

    const date = new Date(nextTime);
    const hour = date.getUTCHours();

    // Saat tek ise (13:00, 15:00) 1 saatliktir
    if (hour % 2 !== 0) return 1;
    // 4'e bölünmüyorsa (14:00) 2 saatliktir
    if (hour % 4 !== 0) return 2;
    // 8'e bölünmüyorsa (12:00, 20:00) 4 saatliktir
    if (hour % 8 !== 0) return 4;

    return 8;
}

// İki sayının En Küçük Ortak Katını (EKOK/LCM) bulur
function calculateLCM(a, b) {
    const gcd = (x, y) => (!y ? x : gcd(y, x % y));
    return (a * b) / gcd(a, b);
}

function calculateDetailedFunding(exchangeA, exchangeB, dataA, dataB, strategy, tradeSize = 100) {
    // 1. Funding Interval ve Zaman Verilerini Al
    // Metadata servisi veya verinin kendisi, yoksa tahmin
    const intervalA = metadataService.getInterval(exchangeA, dataA.symbol) || dataA.fundingInterval || estimateFundingInterval(dataA.nextFundingTime);
    const intervalB = metadataService.getInterval(exchangeB, dataB.symbol) || dataB.fundingInterval || estimateFundingInterval(dataB.nextFundingTime);

    const now = Date.now();
    const nextTimeA = dataA.nextFundingTime ? new Date(dataA.nextFundingTime).getTime() : now + (intervalA * 3600000);
    const nextTimeB = dataB.nextFundingTime ? new Date(dataB.nextFundingTime).getTime() : now + (intervalB * 3600000);

    // 2. Döngü Süresini Belirle (Cycle Duration)
    // İki intervalin ortak katı (Örn: 1h ve 8h -> 8h. 4h ve 8h -> 8h. 1h ve 1h -> 1h)
    // Maksimum 24 saatle sınırla ki sonsuz döngü olmasın (örn: 7h ve 8h -> 56h olur ama biz 24h bakalım)
    let cycleDurationHours = calculateLCM(intervalA, intervalB);
    if (cycleDurationHours > 24) cycleDurationHours = 24;

    // 3. Döngü İçindeki Ödeme Sayısını Hesapla (Frequency Analysis)
    // A Borsası için:
    let paymentsA = 0;
    // İlk ödeme zamanı döngü içinde mi?
    let timeCursorA = nextTimeA;
    const cycleEndTime = now + (cycleDurationHours * 3600000);

    while (timeCursorA <= cycleEndTime) {
        paymentsA++;
        timeCursorA += (intervalA * 3600000);
    }

    // B Borsası için:
    let paymentsB = 0;
    let timeCursorB = nextTimeB;
    while (timeCursorB <= cycleEndTime) {
        paymentsB++;
        timeCursorB += (intervalB * 3600000);
    }

    // 4. Funding Gelirini Hesapla
    // Stratejiye göre kimden alıp kime ödüyoruz?
    // Long A (%y): +y öder (eğer pozitifse eksi yazar, negatifse artı yazar ters mantık)
    // Kural: Rate POZİTİF ise LONG ÖDER, SHORT ALIR.
    // Kural: Rate NEGATİF ise LONG ALIR, SHORT ÖDER.

    // Bizim Strateji Değişkeni: 'LONG_A_SHORT_B' veya 'SHORT_A_LONG_B'
    // Funding Geliri = (Pozisyon Yönü * -1 * Rate)
    // Long (+1) * -1 * PositiveRate (+0.01) = -0.01 (Öder)
    // Short (-1) * -1 * PositiveRate (+0.01) = +0.01 (Alır)

    let rateA = parseFloat(dataA.fundingRate);
    let rateB = parseFloat(dataB.fundingRate);

    let directionA = strategy === 'LONG_A_SHORT_B' ? 1 : -1; // 1: Long, -1: Short
    let directionB = strategy === 'LONG_A_SHORT_B' ? -1 : 1;

    // Her ödeme periyodu için kümülatif getiri
    // Basit olması için rate'in sabit kaldığını varsayıyoruz (Conservative approach)
    let totalFundingIncomePercent =
        (paymentsA * (directionA * -1 * rateA)) +
        (paymentsB * (directionB * -1 * rateB));

    let totalFundingIncomeUsd = (totalFundingIncomePercent / 100) * tradeSize;

    // 5. Yıllıklandırma (APR) - Sadece Funding üzerinden requested
    // Cycle süresince kazanılan para buysa, 1 yılda (8760 saat) ne olur?
    const cyclesPerYear = 8760 / cycleDurationHours;
    const annualFundingUsd = totalFundingIncomeUsd * cyclesPerYear;
    const annualAPR = (annualFundingUsd / tradeSize) * 100;

    return {
        intervals: { a: intervalA, b: intervalB },
        cycle: {
            durationHours: cycleDurationHours,
            paymentsCountA: paymentsA,
            paymentsCountB: paymentsB,
            nextPaymentTimeA: nextTimeA,
            nextPaymentTimeB: nextTimeB
        },
        funding: {
            rateA: rateA,
            rateB: rateB,
            netCycleIncomeUsd: totalFundingIncomeUsd,
            netCycleIncomePercent: totalFundingIncomePercent
        },
        annual: {
            usd: annualFundingUsd,
            apr: annualAPR
        }
    };
}

module.exports = {
    calculateDetailedFunding,
    estimateFundingInterval
};
