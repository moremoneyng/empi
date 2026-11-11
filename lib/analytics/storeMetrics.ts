/**
 * SERVER-ONLY: single source of truth for the admin dashboard numbers.
 *
 * READ-ONLY - this module only runs find() queries. It never writes to the database.
 *
 * Revenue rules (kept deliberately simple so every number can be explained):
 *  - An online / manual-invoice order (UnifiedOrder) counts once its payment is verified
 *    (or an admin has moved it past "pending"). Cancelled / deleted orders never count.
 *  - An offline (walk-in) order counts unless it is pending, cancelled or refunded.
 *  - Revenue = order total − VAT − refundable caution fee (so it is ex-VAT and ex-deposit).
 *    The Flutterwave fee is paid on top of the total and is never revenue.
 *  - Each order's revenue is split into Sales / Rentals / Custom using its own line items
 *    (rental lines weighted by rental days), so the split always adds up to the total.
 *  - Output VAT only comes from counted (paid) orders. Input VAT comes from expenses.
 *  - Net profit = revenue − operating expenses − payroll paid. VAT is not subtracted again
 *    because revenue is already ex-VAT.
 */
import connectDB from '@/lib/mongodb';
import UnifiedOrder from '@/lib/models/UnifiedOrder';
import Order from '@/lib/models/Order';
import Expense from '@/lib/models/Expense';
import Buyer from '@/lib/models/Buyer';
import Product from '@/lib/models/Product';
import PayrollRun from '@/lib/models/PayrollRun';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RangeKey = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | '12m' | 'all';
export const RANGE_KEYS: RangeKey[] = ['7d', '30d', '90d', 'mtd', 'ytd', '12m', 'all'];

const DAY = 86_400_000;
const LAGOS_OFFSET = 3_600_000; // Africa/Lagos is UTC+1 all year (no DST)

type Channel = 'online' | 'manual_invoice' | 'offline';
type Kind = 'sale' | 'rental' | 'mixed' | 'custom';

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** YYYY-MM-DD in Lagos time */
const lagosDayKey = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET).toISOString().slice(0, 10);
const lagosMonthKey = (d: Date) => lagosDayKey(d).slice(0, 7);
/** Midnight (Lagos) of the day containing `d`, as a UTC Date */
const lagosStartOfDay = (d: Date) =>
  new Date(Math.floor((d.getTime() + LAGOS_OFFSET) / DAY) * DAY - LAGOS_OFFSET);

export function resolveRange(key: RangeKey, now = new Date(), earliest?: Date) {
  const today = lagosStartOfDay(now);
  const lagosNow = new Date(now.getTime() + LAGOS_OFFSET);
  const y = lagosNow.getUTCFullYear();
  const m = lagosNow.getUTCMonth();
  let from: Date;
  let label: string;
  switch (key) {
    case '7d': from = new Date(today.getTime() - 6 * DAY); label = 'Last 7 days'; break;
    case '90d': from = new Date(today.getTime() - 89 * DAY); label = 'Last 90 days'; break;
    case 'mtd': from = new Date(Date.UTC(y, m, 1) - LAGOS_OFFSET); label = 'This month'; break;
    case 'ytd': from = new Date(Date.UTC(y, 0, 1) - LAGOS_OFFSET); label = 'This year'; break;
    case '12m': from = new Date(Date.UTC(y, m - 11, 1) - LAGOS_OFFSET); label = 'Last 12 months'; break;
    case 'all': from = earliest ? lagosStartOfDay(earliest) : new Date(Date.UTC(y, 0, 1) - LAGOS_OFFSET); label = 'All time'; break;
    case '30d':
    default: from = new Date(today.getTime() - 29 * DAY); label = 'Last 30 days'; break;
  }
  const to = now;
  const span = to.getTime() - from.getTime();
  const hasPrev = key !== 'all';
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - span);
  const granularity: 'day' | 'month' = span > 92 * DAY ? 'month' : 'day';
  return { key, label, from, to, prevFrom, prevTo, hasPrev, granularity };
}

interface NormalizedOrder {
  id: string;
  orderNumber: string;
  channel: Channel;
  kind: Kind;
  customer: string;
  email: string;
  createdAt: Date;
  status: string;
  paid: boolean;          // payment confirmed
  counted: boolean;       // counts towards revenue
  cancelled: boolean;
  total: number;
  vat: number;
  cautionFee: number;
  revenue: number;        // total - vat - caution
  sales: number;
  rentals: number;
  custom: number;
  lines: Array<{ key: string; name: string; image?: string; productId?: string; mode: 'buy' | 'rent'; qty: number; share: number }>;
  rentalSchedule?: { pickupDate?: string; pickupTime?: string; returnDate?: string; pickupLocation?: string; rentalDays?: number };
}

const ADVANCED_STATUSES = ['approved', 'in_production', 'ready_for_delivery', 'delivered', 'completed', 'confirmed', 'processing', 'shipped'];

function splitRevenue(
  revenue: number,
  isCustom: boolean,
  rawLines: Array<{ name: string; image?: string; productId?: string; mode: 'buy' | 'rent'; qty: number; weight: number }>,
  fallbackMode: 'buy' | 'rent'
) {
  let sales = 0;
  let rentals = 0;
  let custom = 0;
  const lines: NormalizedOrder['lines'] = [];

  if (isCustom) {
    custom = revenue;
    return { sales, rentals, custom, lines, kind: 'custom' as Kind };
  }

  const totalWeight = rawLines.reduce((s, l) => s + l.weight, 0);
  rawLines.forEach((l) => {
    const share = totalWeight > 0 ? (revenue * l.weight) / totalWeight : rawLines.length ? revenue / rawLines.length : 0;
    if (l.mode === 'rent') rentals += share; else sales += share;
    lines.push({
      key: l.productId && !['OFFLINE-ITEM', 'undefined', 'null'].includes(l.productId) ? `p:${l.productId}` : `n:${l.name.trim().toLowerCase()}`,
      name: l.name, image: l.image, productId: l.productId, mode: l.mode, qty: l.qty, share,
    });
  });
  if (rawLines.length === 0) {
    if (fallbackMode === 'rent') rentals = revenue; else sales = revenue;
  }
  const kind: Kind = rentals > 0 && sales > 0 ? 'mixed' : rentals > 0 ? 'rental' : 'sale';
  return { sales, rentals, custom, lines, kind };
}

function normalizeUnified(o: any): NormalizedOrder {
  const status = String(o.status || 'pending').toLowerCase();
  const cancelled = status === 'cancelled';
  const paid = o.paymentVerified === true;
  const counted = !cancelled && (paid || ADVANCED_STATUSES.includes(status));
  const total = num(o.total);
  const vat = num(o.vat);
  const cautionFee = num(o.cautionFee);
  const revenue = Math.max(0, total - vat - cautionFee);
  const scheduleDays = num(o.rentalSchedule?.rentalDays) || 1;

  const rawLines = (Array.isArray(o.items) ? o.items : []).map((it: any) => {
    const mode: 'buy' | 'rent' = it.mode === 'rent' || it.mode === 'rental' ? 'rent' : 'buy';
    const qty = Math.max(1, num(it.quantity) || 1);
    const unit = num(it.unitPrice ?? it.price);
    const days = mode === 'rent' ? num(it.rentalDays) || scheduleDays : 1;
    return {
      name: String(it.name || 'Costume'),
      image: it.imageUrl || it.image || undefined,
      productId: it.productId ? String(it.productId) : undefined,
      mode, qty, weight: unit * qty * days,
    };
  });

  const isCustom = o.orderType === 'custom';
  const split = splitRevenue(revenue, isCustom, rawLines, o.rentalSchedule ? 'rent' : 'buy');
  const customer = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email || 'Customer';

  return {
    id: String(o._id),
    orderNumber: o.orderNumber || String(o._id).slice(-6),
    channel: o.source === 'manual_invoice' ? 'manual_invoice' : 'online',
    kind: split.kind,
    customer,
    email: String(o.email || '').toLowerCase(),
    createdAt: new Date(o.createdAt || Date.now()),
    status, paid, counted, cancelled,
    total, vat, cautionFee, revenue,
    sales: split.sales, rentals: split.rentals, custom: split.custom,
    lines: split.lines,
    rentalSchedule: o.rentalSchedule || undefined,
  };
}

function normalizeOffline(o: any): NormalizedOrder {
  const status = String(o.status || 'completed').toLowerCase();
  const cancelled = ['cancelled', 'refunded'].includes(status);
  const paid = !cancelled && (status !== 'pending' || o.paymentStatus === 'confirmed');
  const total = num(o.total);
  const vat = num(o.vat);
  const cautionFee = num(o.cautionFee);
  const revenue = Math.max(0, total - vat - cautionFee);
  const offlineMode: 'buy' | 'rent' = o.offlineType === 'rental' ? 'rent' : 'buy';

  const rawLines = (Array.isArray(o.items) ? o.items : []).map((it: any) => {
    const mode: 'buy' | 'rent' = it.mode === 'rent' || it.mode === 'rental' ? 'rent' : it.mode === 'buy' ? 'buy' : offlineMode;
    const qty = Math.max(1, num(it.quantity) || 1);
    return {
      name: String(it.name || 'Walk-in item'),
      image: it.imageUrl || it.image || undefined,
      productId: it.productId ? String(it.productId) : undefined,
      mode, qty, weight: num(it.price ?? it.unitPrice) * qty,
    };
  });
  const split = splitRevenue(revenue, false, rawLines, offlineMode);

  return {
    id: String(o._id),
    orderNumber: o.orderNumber || String(o._id).slice(-6),
    channel: 'offline',
    kind: split.kind,
    customer: `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email || 'Walk-in customer',
    email: String(o.email || '').toLowerCase(),
    createdAt: new Date(o.createdAt || Date.now()),
    status, paid, counted: paid, cancelled,
    total, vat, cautionFee, revenue,
    sales: split.sales, rentals: split.rentals, custom: 0,
    lines: split.lines,
  };
}

async function loadAll() {
  await connectDB();
  const [unified, offline, expenses, payroll, buyers, products] = await Promise.all([
    UnifiedOrder.find({ isActive: { $ne: false } })
      .select('orderNumber orderType source firstName lastName email items total vat cautionFee status paymentVerified createdAt rentalSchedule')
      .lean(),
    Order.find({ isOffline: true })
      .select('orderNumber firstName lastName email items total vat cautionFee status paymentStatus offlineType createdAt')
      .lean(),
    Expense.find({}).select('amount vat isVATApplicable date createdAt category').lean(),
    PayrollRun.find({ status: 'paid' }).select('netPay paidAt scheduledDate').lean().catch(() => []),
    Buyer.find({}).select('createdAt').lean(),
    Product.find({}).select('name imageUrl availableForRent availableForBuy isCostumeShow category maxRentQuantity').lean(),
  ]);

  return {
    unified: unified as any[],
    offline: offline as any[],
    expenses: expenses as any[],
    payroll: payroll as any[],
    buyers: buyers as any[],
    products: products as any[],
  };
}

export interface StoreRecords {
  unified: any[];
  offline: any[];
  expenses: any[];
  payroll: any[];
  buyers: any[];
  products: any[];
}

const inWindow = (d: Date, from: Date, to: Date) => d >= from && d <= to;

function sumFinancials(
  orders: NormalizedOrder[], expenses: any[], payroll: any[], from: Date, to: Date
) {
  const counted = orders.filter((o) => o.counted && inWindow(o.createdAt, from, to));
  const sales = counted.reduce((s, o) => s + o.sales, 0);
  const rentals = counted.reduce((s, o) => s + o.rentals, 0);
  const custom = counted.reduce((s, o) => s + o.custom, 0);
  const revenue = sales + rentals + custom;
  const outputVAT = counted.reduce((s, o) => s + o.vat, 0);
  const cautionCollected = counted.reduce((s, o) => s + o.cautionFee, 0);
  const grossCollected = counted.reduce((s, o) => s + o.total, 0);

  const exps = expenses.filter((e) => inWindow(new Date(e.date || e.createdAt), from, to));
  const operating = exps.reduce((s, e) => s + num(e.amount), 0);
  const inputVAT = exps.reduce((s, e) => s + (e.isVATApplicable === false ? 0 : num(e.vat)), 0);
  const pay = payroll.filter((p) => inWindow(new Date(p.paidAt || p.scheduledDate), from, to));
  const payrollPaid = pay.reduce((s, p) => s + num(p.netPay), 0);
  const totalExpenses = operating + payrollPaid;
  const netProfit = revenue - totalExpenses;

  return {
    orders: counted.length,
    rentalOrders: counted.filter((o) => o.kind === 'rental' || o.kind === 'mixed').length,
    salesOrders: counted.filter((o) => o.kind === 'sale' || o.kind === 'mixed').length,
    customOrders: counted.filter((o) => o.kind === 'custom').length,
    revenue: round(revenue), sales: round(sales), rentals: round(rentals), custom: round(custom),
    grossCollected: round(grossCollected),
    outputVAT: round(outputVAT), inputVAT: round(inputVAT),
    vatPayable: round(Math.max(0, outputVAT - inputVAT)),
    cautionCollected: round(cautionCollected),
    operatingExpenses: round(operating), expenseCount: exps.length,
    payrollPaid: round(payrollPaid), payrollCount: pay.length,
    totalExpenses: round(totalExpenses),
    netProfit: round(netProfit),
    margin: revenue > 0 ? round((netProfit / revenue) * 100) : 0,
    averageOrderValue: counted.length ? round(revenue / counted.length) : 0,
    _counted: counted,
  };
}

export async function getStoreAnalytics(rangeKey: RangeKey = '30d') {
  return buildStoreAnalytics(await loadAll(), rangeKey, new Date());
}

/** Pure calculation (no database access) - used by the API and by tests */
export function buildStoreAnalytics(records: StoreRecords, rangeKey: RangeKey, now: Date) {
  const { expenses, payroll, buyers, products } = records;
  const orders = [
    ...records.unified.map(normalizeUnified),
    ...records.offline.map(normalizeOffline),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const earliest = orders.length ? orders[orders.length - 1].createdAt : undefined;
  const range = resolveRange(rangeKey, now, earliest);

  const current = sumFinancials(orders, expenses, payroll, range.from, range.to);
  const previous = range.hasPrev ? sumFinancials(orders, expenses, payroll, range.prevFrom, range.prevTo) : null;
  const counted = current._counted;

  // ── Time series ────────────────────────────────────────────────
  const buckets = new Map<string, { date: string; sales: number; rentals: number; custom: number; orders: number }>();
  const keyOf = range.granularity === 'month' ? lagosMonthKey : lagosDayKey;
  if (range.granularity === 'day') {
    for (let t = lagosStartOfDay(range.from).getTime(); t <= range.to.getTime(); t += DAY) {
      const k = lagosDayKey(new Date(t));
      buckets.set(k, { date: k, sales: 0, rentals: 0, custom: 0, orders: 0 });
    }
  } else {
    const start = new Date(range.from.getTime() + LAGOS_OFFSET);
    const end = new Date(range.to.getTime() + LAGOS_OFFSET);
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      buckets.set(k, { date: k, sales: 0, rentals: 0, custom: 0, orders: 0 });
    }
  }
  counted.forEach((o) => {
    const b = buckets.get(keyOf(o.createdAt));
    if (!b) return;
    b.sales += o.sales; b.rentals += o.rentals; b.custom += o.custom; b.orders += 1;
  });
  const series = Array.from(buckets.values()).map((b) => ({
    ...b, sales: round(b.sales), rentals: round(b.rentals), custom: round(b.custom),
  }));

  // ── Channels ───────────────────────────────────────────────────
  const channelDefs: Array<{ key: Channel; label: string }> = [
    { key: 'online', label: 'Website checkout' },
    { key: 'manual_invoice', label: 'Manual invoices' },
    { key: 'offline', label: 'Walk-in / offline' },
  ];
  const channels = channelDefs.map((c) => {
    const list = counted.filter((o) => o.channel === c.key);
    return {
      ...c,
      orders: list.length,
      revenue: round(list.reduce((s, o) => s + o.revenue, 0)),
      sales: round(list.reduce((s, o) => s + o.sales, 0)),
      rentals: round(list.reduce((s, o) => s + o.rentals, 0)),
      custom: round(list.reduce((s, o) => s + o.custom, 0)),
    };
  });

  // ── Top costumes (by revenue in range) ─────────────────────────
  const productById = new Map(products.map((p: any) => [String(p._id), p]));
  const top = new Map<string, { key: string; name: string; image?: string; productId?: string; revenue: number; soldUnits: number; rentedUnits: number }>();
  counted.forEach((o) => o.lines.forEach((l) => {
    const cur = top.get(l.key) || { key: l.key, name: l.name, image: l.image, productId: l.productId, revenue: 0, soldUnits: 0, rentedUnits: 0 };
    cur.revenue += l.share;
    if (l.mode === 'rent') cur.rentedUnits += l.qty; else cur.soldUnits += l.qty;
    if (!cur.image) cur.image = l.image || (l.productId ? productById.get(l.productId)?.imageUrl : undefined);
    top.set(l.key, cur);
  }));
  const topProducts = Array.from(top.values())
    .map((t) => ({ ...t, revenue: round(t.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // ── Operations (current state, not range-bound) ────────────────
  const online = orders.filter((o) => o.channel !== 'offline' && !o.cancelled);
  const awaitingPayment = online.filter((o) => !o.paid && o.status === 'pending');
  const toApprove = online.filter((o) => o.paid && o.status === 'pending');
  const inProduction = online.filter((o) => ['approved', 'in_production'].includes(o.status));
  const readyForDelivery = online.filter((o) => o.status === 'ready_for_delivery');
  const deliveredInRange = online.filter((o) => o.status === 'delivered' && inWindow(o.createdAt, range.from, range.to));

  const todayKey = lagosDayKey(now);
  const weekAheadKey = lagosDayKey(new Date(now.getTime() + 7 * DAY));
  const rentalEvents: Array<{ id: string; orderNumber: string; customer: string; type: 'pickup' | 'return'; date: string; time?: string; location?: string }> = [];
  online.filter((o) => o.counted && o.rentalSchedule).forEach((o) => {
    const rs = o.rentalSchedule!;
    if (rs.pickupDate && rs.pickupDate >= todayKey && rs.pickupDate <= weekAheadKey && o.status !== 'delivered') {
      rentalEvents.push({ id: o.id, orderNumber: o.orderNumber, customer: o.customer, type: 'pickup', date: rs.pickupDate, time: rs.pickupTime, location: rs.pickupLocation });
    }
    if (rs.returnDate && rs.returnDate >= todayKey && rs.returnDate <= weekAheadKey) {
      rentalEvents.push({ id: o.id, orderNumber: o.orderNumber, customer: o.customer, type: 'return', date: rs.returnDate, location: rs.pickupLocation });
    }
  });
  rentalEvents.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  const pick = (o: NormalizedOrder) => ({
    id: o.id, orderNumber: o.orderNumber, customer: o.customer, total: round(o.total),
    status: o.status, paid: o.paid, counted: o.counted, channel: o.channel, kind: o.kind,
    createdAt: o.createdAt.toISOString(),
  });

  // ── Customers ──────────────────────────────────────────────────
  const payingEmails = new Map<string, number>();
  orders.filter((o) => o.counted && o.email && !o.email.endsWith('@empi.invalid')).forEach((o) => {
    payingEmails.set(o.email, (payingEmails.get(o.email) || 0) + 1);
  });
  const payingInRange = new Set(counted.map((o) => o.email).filter((e) => e && !e.endsWith('@empi.invalid')));
  const repeatCustomers = Array.from(payingEmails.values()).filter((n) => n > 1).length;

  return {
    generatedAt: now.toISOString(),
    range: {
      key: range.key, label: range.label, granularity: range.granularity,
      from: range.from.toISOString(), to: range.to.toISOString(),
      prevFrom: range.hasPrev ? range.prevFrom.toISOString() : null,
      prevTo: range.hasPrev ? range.prevTo.toISOString() : null,
    },
    kpis: { ...stripInternal(current), previous: previous ? stripInternal(previous) : null },
    series,
    channels,
    topProducts,
    operations: {
      awaitingPayment: { count: awaitingPayment.length, amount: round(awaitingPayment.reduce((s, o) => s + o.total, 0)) },
      toApprove: { count: toApprove.length, amount: round(toApprove.reduce((s, o) => s + o.total, 0)) },
      inProduction: { count: inProduction.length },
      readyForDelivery: { count: readyForDelivery.length },
      deliveredInRange: { count: deliveredInRange.length },
      rentalEvents: rentalEvents.slice(0, 8),
    },
    recentOrders: orders.slice(0, 8).map(pick),
    customers: {
      registered: buyers.length,
      newInRange: buyers.filter((b) => b.createdAt && inWindow(new Date(b.createdAt), range.from, range.to)).length,
      payingInRange: payingInRange.size,
      payingAllTime: payingEmails.size,
      repeatCustomers,
    },
    catalog: {
      products: products.length,
      rentable: products.filter((p) => p.availableForRent !== false).length,
      costumeShow: products.filter((p) => p.isCostumeShow === true || p.category === 'costume-show').length,
      rentLimited: products.filter((p) => Number(p.maxRentQuantity) > 0).length,
    },
    counts: {
      totalOrders: orders.filter((o) => !o.cancelled).length,
      pendingOrders: awaitingPayment.length + toApprove.length,
    },
  };
}

function stripInternal<T extends { _counted?: unknown }>(obj: T) {
  const { _counted, ...rest } = obj;
  void _counted;
  return rest;
}

/** Lightweight counts for sidebar / mobile badges */
export async function getStoreBadgeCounts() {
  await connectDB();
  const [awaiting, toApprove, products, buyers, totalOnline, totalOffline] = await Promise.all([
    UnifiedOrder.countDocuments({ isActive: { $ne: false }, status: 'pending', paymentVerified: { $ne: true } }),
    UnifiedOrder.countDocuments({ isActive: { $ne: false }, status: 'pending', paymentVerified: true }),
    Product.countDocuments({}),
    Buyer.countDocuments({}),
    UnifiedOrder.countDocuments({ isActive: { $ne: false }, status: { $ne: 'cancelled' } }),
    Order.countDocuments({ isOffline: true, status: { $nin: ['cancelled', 'refunded'] } }),
  ]);
  return { awaitingPayment: awaiting, toApprove, pendingOrders: awaiting + toApprove, totalProducts: products, registeredCustomers: buyers, totalOrders: totalOnline + totalOffline };
}

export type StoreAnalytics = ReturnType<typeof buildStoreAnalytics>;
