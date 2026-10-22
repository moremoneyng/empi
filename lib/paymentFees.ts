/**
 * Flutterwave processing fees are paid by the customer, not EMPI.
 *
 * The customer is charged the order total plus a processing fee large enough that,
 * after Flutterwave deducts its fees from the charge, EMPI still receives the full order total.
 */

// Only used when Flutterwave's fee API can't be reached. Matches EMPI's Flutterwave rate
// (2%, no cap), plus ₦50 stamp duty from ₦10,000 to stay on the safe side.
const FALLBACK_FEE_RATE = 0.02;
const STAMP_DUTY = 50;
const STAMP_DUTY_THRESHOLD = 10000;

/** Estimated fees Flutterwave deducts from a charge of `chargeAmount` Naira */
export function estimateFlutterwaveFee(chargeAmount: number): number {
  const fee = chargeAmount * FALLBACK_FEE_RATE;
  const stampDuty = chargeAmount >= STAMP_DUTY_THRESHOLD ? STAMP_DUTY : 0;
  return fee + stampDuty;
}

/**
 * Processing fee to add to `orderTotal` so that the charge, minus the fees deducted
 * from it (`feeFor(charge)`), still covers the order total. The charge is a whole Naira amount.
 */
export async function grossUpProcessingFee(
  orderTotal: number,
  feeFor: (chargeAmount: number) => number | Promise<number>
): Promise<number> {
  let charge = Math.ceil(orderTotal);
  // Fees grow with the charge, so step up until the fee on the charge is covered
  for (let i = 0; i < 6; i++) {
    const next = Math.ceil(orderTotal + (await feeFor(charge)));
    if (next <= charge) break;
    charge = next;
  }
  return Math.round((charge - orderTotal) * 100) / 100;
}
