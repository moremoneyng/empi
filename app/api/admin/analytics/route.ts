import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/adminAuth';
import { hasPermission } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';
import { getStoreAnalytics, RANGE_KEYS, type RangeKey } from '@/lib/analytics/storeMetrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics?range=30d
 * Read-only store overview for the admin dashboard. Every number is computed on the server
 * from the same rules (see lib/analytics/storeMetrics.ts).
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const permissions = (admin.permissions || []) as Permission[];
  if (admin.role !== 'super_admin' && !hasPermission(permissions, 'view_dashboard')) {
    return NextResponse.json({ error: 'You do not have access to the dashboard' }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get('range') as RangeKey | null;
  const range: RangeKey = requested && RANGE_KEYS.includes(requested) ? requested : '30d';

  try {
    const data = await getStoreAnalytics(range);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[Admin Analytics] Failed:', error);
    return NextResponse.json({ error: 'Could not load store analytics' }, { status: 500 });
  }
}
