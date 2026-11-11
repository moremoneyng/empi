import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { fulfillCheckout } from '@/lib/orders/onlinePayments';

// Checking Flutterwave and creating orders can take longer than the default limit
export const maxDuration = 60;

function hashMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/flutterwave
 * Flutterwave calls this when a payment completes - even if the customer closed the page.
 *
 * Setup (Flutterwave dashboard → Settings → Webhooks):
 *   URL:         https://www.empicostumes.com/api/webhooks/flutterwave
 *   Secret hash: same value as the FLUTTERWAVE_WEBHOOK_HASH environment variable
 *
 * The webhook body is never trusted: fulfillCheckout re-confirms the payment with Flutterwave's
 * API and only creates an order from the cart saved on our server at checkout.
 */
export async function POST(request: NextRequest) {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!secretHash) {
    console.error('[webhooks/flutterwave] FLUTTERWAVE_WEBHOOK_HASH is not set - ignoring webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  if (!hashMatches(request.headers.get('verif-hash'), secretHash)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = await request.json().catch(() => null);
  const data = event?.data || event; // v3 wraps in {event, data}; older payloads are flat
  const reference: string | undefined = data?.tx_ref || data?.txRef;
  const status: string | undefined = data?.status;

  if (!reference || !reference.startsWith('EMPI-')) return NextResponse.json({ received: true, ignored: true });
  if (status && status !== 'successful' && status !== 'completed') {
    return NextResponse.json({ received: true, status });
  }

  try {
    const result = await fulfillCheckout(reference);
    console.log(`[webhooks/flutterwave] ${reference}: ${result.status}`);
    return NextResponse.json({ received: true, result: result.status });
  } catch (error) {
    console.error('[webhooks/flutterwave] Failed to create order:', error);
    // 500 makes Flutterwave retry later
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
