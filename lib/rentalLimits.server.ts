/**
 * SERVER-ONLY: enforce rental quantity limits against the live product records.
 * Read-only - only looks products up.
 */
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/lib/models/Product';
import { getRentLimit, rentLimitMessage } from '@/lib/rentalLimits';

export interface RentLimitViolation {
  productId: string;
  name: string;
  limit: number;
  requested: number;
  message: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Rental limits for the given product ids: { [id]: { limit, isCostumeShow, name } } */
export async function getRentLimitsFor(productIds: string[]) {
  const ids = Array.from(new Set(productIds.filter((id) => mongoose.isValidObjectId(id))));
  if (ids.length === 0) return {} as Record<string, { limit: number | null; isCostumeShow: boolean; name: string }>;
  await connectDB();
  const products = await Product.find({ _id: { $in: ids } })
    .select('name isCostumeShow category maxRentQuantity')
    .lean();
  const out: Record<string, { limit: number | null; isCostumeShow: boolean; name: string }> = {};
  (products as any[]).forEach((p) => {
    out[String(p._id)] = {
      limit: getRentLimit(p),
      isCostumeShow: p.isCostumeShow === true || p.category === 'costume-show',
      name: p.name,
    };
  });
  return out;
}

/**
 * Checks the rental lines of a cart / order payload. Quantities of the same costume are added
 * up across colours and sizes. Returns every line that goes over its limit.
 */
export async function findRentLimitViolations(items: unknown): Promise<RentLimitViolation[]> {
  if (!Array.isArray(items)) return [];
  const totals = new Map<string, { qty: number; name: string }>();
  items.forEach((raw: any) => {
    if (!raw || (raw.mode !== 'rent' && raw.mode !== 'rental')) return;
    const id = String(raw.productId || raw.id || '');
    if (!id) return;
    const cur = totals.get(id) || { qty: 0, name: String(raw.name || 'This costume') };
    cur.qty += Math.max(1, Math.floor(Number(raw.quantity) || 1));
    totals.set(id, cur);
  });
  if (totals.size === 0) return [];

  const limits = await getRentLimitsFor(Array.from(totals.keys()));
  const violations: RentLimitViolation[] = [];
  totals.forEach((t, id) => {
    const info = limits[id];
    if (!info || info.limit === null || t.qty <= info.limit) return;
    const name = info.name || t.name;
    violations.push({ productId: id, name, limit: info.limit, requested: t.qty, message: rentLimitMessage(name, info.limit) });
  });
  return violations;
}
