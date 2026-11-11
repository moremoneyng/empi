import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CheckoutIntent from '@/lib/models/CheckoutIntent';
import { findRentLimitViolations } from '@/lib/rentalLimits.server';

const REFERENCE_PATTERN = /^EMPI-\d{10,16}-[a-z0-9]{4,16}$/;
const MAX_BODY_BYTES = 200_000;

/**
 * POST /api/checkout/intent
 * Saves the customer's cart on the server before they are sent to Flutterwave, so the order
 * can be created even if they close the page after paying. Creating it does not mark anything
 * paid: an order is only created once Flutterwave confirms the payment.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Checkout too large' }, { status: 413 });

    const body = JSON.parse(raw || '{}');
    const reference = String(body.reference || '');
    const payload = body.payload;
    const paymentFee = Number(body.paymentFee) || 0;

    if (!REFERENCE_PATTERN.test(reference)) return NextResponse.json({ error: 'Invalid reference' }, { status: 400 });
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Missing order details' }, { status: 400 });
    }
    const email = String(payload.email || '').toLowerCase().trim();
    const orderTotal = Number(payload.total);
    if (!email || !payload.firstName || !Array.isArray(payload.items) || payload.items.length === 0) {
      return NextResponse.json({ error: 'Missing customer or cart details' }, { status: 400 });
    }
    if (!Number.isFinite(orderTotal) || orderTotal <= 0 || paymentFee < 0) {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }

    await connectDB();

    // Stock limits for rentals are checked BEFORE the customer pays
    const rentViolations = await findRentLimitViolations(payload.items);
    if (rentViolations.length > 0) {
      return NextResponse.json(
        {
          error: `${rentViolations.map((v) => v.message).join(' ')} Please reduce the quantity in your cart.`,
          code: 'RENT_LIMIT_EXCEEDED',
          violations: rentViolations,
        },
        { status: 422 }
      );
    }

    const existing = await CheckoutIntent.findOne({ reference }).select('status').lean();
    if (existing && existing.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'This checkout has already been processed' }, { status: 409 });
    }

    // Only fields the order needs - never let the browser set payment status
    const { paymentVerified: _pv, status: _s, paymentReference: _pr, ...cleanPayload } = payload;
    void _pv; void _s; void _pr;

    await CheckoutIntent.updateOne(
      { reference, status: 'awaiting_payment' },
      {
        $set: { email, payload: { ...cleanPayload, email }, orderTotal, paymentFee },
        $setOnInsert: { reference, status: 'awaiting_payment' },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, reference });
  } catch (error) {
    console.error('[checkout/intent] Failed to save checkout:', error);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
