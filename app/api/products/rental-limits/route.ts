import { NextRequest, NextResponse } from 'next/server';
import { getRentLimitsFor } from '@/lib/rentalLimits.server';

const MAX_IDS = 100;

/**
 * GET /api/products/rental-limits?ids=a,b,c
 * Public, read-only. Returns how many of each costume can be rented per order
 * (null = no limit), so the cart can keep quantities within stock.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  try {
    const limits = await getRentLimitsFor(ids);
    return NextResponse.json({ limits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[rental-limits] Failed:', error);
    return NextResponse.json({ limits: {} }, { status: 500 });
  }
}
