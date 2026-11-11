import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getStoreAnalytics, getStoreBadgeCounts } from '@/lib/analytics/storeMetrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dashboard
 * Summary counts used by the sidebar badges and the mobile dashboard.
 * Read-only. Uses the same rules as the main dashboard (lib/analytics/storeMetrics.ts),
 * so the badges always agree with the dashboard.
 *
 * ?summary=badges  → counts only (fast)
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const badges = await getStoreBadgeCounts();
    if (request.nextUrl.searchParams.get('summary') === 'badges') {
      return NextResponse.json(
        { ...badges, pendingInvoices: badges.pendingOrders, timestamp: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const a = await getStoreAnalytics('all');
    const k = a.kpis;
    const counted = a.channels.reduce((s, c) => s + c.orders, 0);
    return NextResponse.json(
      {
        totalRevenue: k.revenue,
        totalSales: k.sales,
        totalRents: k.rentals,
        totalCustom: k.custom,
        totalOrders: badges.totalOrders,
        paidOrders: counted,
        totalProducts: badges.totalProducts,
        pendingOrders: badges.pendingOrders,
        pendingInvoices: badges.pendingOrders,
        awaitingPayment: badges.awaitingPayment,
        toApprove: badges.toApprove,
        totalRentOrders: k.rentalOrders,
        totalSalesOrders: k.salesOrders + k.customOrders,
        completedOrders: a.operations.deliveredInRange.count,
        registeredCustomers: a.customers.registered,
        totalCustomers: a.customers.payingAllTime,
        guestCustomers: Math.max(0, a.customers.payingAllTime - a.customers.registered),
        averageOrderValue: k.averageOrderValue,
        completionRate: counted > 0 ? (a.operations.deliveredInRange.count / counted) * 100 : 0,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
