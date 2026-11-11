/**
 * Rental quantity limits - shared by the storefront (client) and the checkout API (server).
 *
 * Rule:
 *  - Costume Show products can only ever be rented ONE at a time.
 *  - Any other product can have `maxRentQuantity` set by an admin (e.g. we only own 2 of it).
 *    Empty / 0 means "no limit" (the old behaviour), so existing products are unaffected.
 *  - The limit is per costume, across all of its colours and sizes in a single order.
 *  - Limits only apply to renting. Buying is never limited here.
 */
export const COSTUME_SHOW_RENT_LIMIT = 1;

export interface RentLimitSource {
  isCostumeShow?: boolean | null;
  category?: string | null;
  maxRentQuantity?: number | string | null;
}

export function isCostumeShowProduct(p: RentLimitSource | null | undefined): boolean {
  return Boolean(p && (p.isCostumeShow === true || p.category === 'costume-show'));
}

/** The most units of this costume a customer may rent in one order, or null when unlimited */
export function getRentLimit(p: RentLimitSource | null | undefined): number | null {
  if (!p) return null;
  if (isCostumeShowProduct(p)) return COSTUME_SHOW_RENT_LIMIT;
  const max = Math.floor(Number(p.maxRentQuantity));
  return Number.isFinite(max) && max > 0 ? max : null;
}

/** Normalise an admin-entered limit: positive whole number, or null to clear it */
export function normalizeMaxRentQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : null;
}

export function rentLimitMessage(name: string, limit: number): string {
  return limit === 1
    ? `Only 1 "${name}" can be rented per order.`
    : `Only ${limit} of "${name}" can be rented per order.`;
}
