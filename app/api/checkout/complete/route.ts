import { NextRequest, NextResponse } from 'next/server';
import { fulfillCheckout } from '@/lib/orders/onlinePayments';

// Checking Flutterwave and creating orders can take longer than the default limit
export const maxDuration = 60;

/**
 * POST /api/checkout/complete  { reference }
 * Called by the checkout page after Flutterwave reports success (and while polling).
 * The server confirms the payment with Flutterwave itself; the browser's word is never trusted.
 */
export async function POST(request: NextRequest) {
  try {
    const { reference } = await request.json().catch(() => ({}));
    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }
    const result = await fulfillCheckout(reference);
    const done = result.status === 'created' || result.status === 'exists';
    return NextResponse.json({ success: done, ...result }, { status: done ? 200 : 202 });
  } catch (error) {
    console.error('[checkout/complete] Error:', error);
    return NextResponse.json({ success: false, error: 'Could not confirm order yet' }, { status: 500 });
  }
}
