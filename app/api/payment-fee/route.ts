import { NextRequest, NextResponse } from 'next/server';
import { estimateFlutterwaveFee, grossUpProcessingFee } from '@/lib/paymentFees';

const MAX_AMOUNT = 100_000_000;

/** Fees Flutterwave deducts from a card charge of `amount` Naira, per Flutterwave's fee API */
async function flutterwaveFee(amount: number, secretKey: string): Promise<number> {
  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/fee?amount=${amount}&currency=NGN&payment_type=card`,
    { headers: { Authorization: `Bearer ${secretKey}` }, cache: 'no-store' }
  );
  const data = await res.json().catch(() => null);
  const fees = data?.data;
  if (!res.ok || data?.status !== 'success' || !fees) {
    throw new Error(data?.message || `Fee lookup failed (${res.status})`);
  }
  // Flutterwave is already adding its fee on top of the price (dashboard setting) - don't add it twice
  if (Number(fees.charge_amount) > amount) return 0;
  return (Number(fees.fee) || 0) + (Number(fees.stamp_duty_fee) || 0);
}

/**
 * GET /api/payment-fee?amount=<order total in Naira>
 * The processing fee the customer pays on top of the order total when paying with Flutterwave.
 */
export async function GET(request: NextRequest) {
  const amount = Number(request.nextUrl.searchParams.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  try {
    if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY not configured');
    const fee = await grossUpProcessingFee(amount, (charge) => flutterwaveFee(charge, secretKey));
    return NextResponse.json({ fee, total: amount + fee, source: 'flutterwave' });
  } catch (error) {
    console.error('[payment-fee] Falling back to estimated fee:', error);
    const fee = await grossUpProcessingFee(amount, estimateFlutterwaveFee);
    return NextResponse.json({ fee, total: amount + fee, source: 'estimate' });
  }
}
