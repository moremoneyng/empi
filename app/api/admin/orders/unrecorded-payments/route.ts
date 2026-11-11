import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/adminAuth';
import { reconcileOnlinePayments, recordPaymentAsOrder } from '@/lib/orders/onlinePayments';

// Checking Flutterwave and creating orders can take longer than the default limit
export const maxDuration = 60;

/**
 * GET /api/admin/orders/unrecorded-payments
 * Successful Flutterwave payments (last 60 days) that have no order. Payments with a saved
 * checkout are turned into orders automatically during this check.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const result = await reconcileOnlinePayments(60);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[admin/unrecorded-payments] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not check Flutterwave payments' },
      { status: 502 }
    );
  }
}

/**
 * POST /api/admin/orders/unrecorded-payments  { reference, itemsDescription, orderTotal? }
 * Records one paid Flutterwave transaction as an order (insert only; re-confirmed with Flutterwave).
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  try {
    const result = await recordPaymentAsOrder({
      reference: String(body.reference || ''),
      itemsDescription: String(body.itemsDescription || '').slice(0, 500),
      orderTotal: body.orderTotal !== undefined ? Number(body.orderTotal) : undefined,
      adminEmail: String(admin.email || 'admin'),
    });
    console.log(`[Admin] ${admin.email} recorded Flutterwave payment ${body.reference} as order ${result.orderNumber}`);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not record payment' },
      { status: 400 }
    );
  }
}
