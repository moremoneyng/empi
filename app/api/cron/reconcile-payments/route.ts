import { NextRequest, NextResponse } from 'next/server';
import { reconcileOnlinePayments } from '@/lib/orders/onlinePayments';

// Checking Flutterwave and creating orders can take longer than the default limit
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile-payments
 * Runs every 10 minutes (.github/workflows/reconcile-payments.yml) and daily via Vercel Cron.
 * Turns any successful
 * Flutterwave payment that has a saved checkout but no order into an order. Insert-only.
 * Requires CRON_SECRET when it is set.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await reconcileOnlinePayments(7);
    if (result.created.length || result.unrecorded.length) {
      console.log('[cron/reconcile-payments]', JSON.stringify({
        created: result.created,
        unrecorded: result.unrecorded.map((p) => p.reference),
      }));
    }
    return NextResponse.json({
      success: true,
      checked: result.checked,
      created: result.created,
      unrecordedCount: result.unrecorded.length,
    });
  } catch (error) {
    console.error('[cron/reconcile-payments] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
