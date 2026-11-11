/**
 * SERVER-ONLY: makes sure every successful Flutterwave payment becomes an order.
 *
 *  - fulfillCheckout(reference): payment confirmed + saved checkout → create the order (once).
 *  - reconcileOnlinePayments(): lists recent Flutterwave payments, auto-creates orders for any
 *    that have a saved checkout, and reports the rest so an admin can record them.
 *  - recordPaymentAsOrder(): admin records a paid transaction that has no saved checkout.
 *
 * Every path only inserts orders. Nothing existing is edited or deleted. Each payment can only
 * ever produce one order (checked by paymentReference, under a lock on the saved checkout).
 */
import connectDB from '@/lib/mongodb';
import UnifiedOrder from '@/lib/models/UnifiedOrder';
import CheckoutIntent from '@/lib/models/CheckoutIntent';
import Buyer from '@/lib/models/Buyer';
import { checkPaymentForOrder } from '@/lib/paymentVerification';
import { createPaidOrder } from '@/lib/orders/createOrder';

const LOCK_MS = 2 * 60 * 1000;

export type FulfillResult =
  | { status: 'exists'; orderId: string; orderNumber: string }
  | { status: 'created'; orderId: string; orderNumber: string; invoice?: unknown }
  | { status: 'no_checkout' }
  | { status: 'busy' }
  | { status: 'unpaid'; reason?: string };

async function findOrderForReference(reference: string) {
  return UnifiedOrder.findOne({ paymentReference: reference }).select('_id orderNumber isActive').lean() as Promise<
    { _id: unknown; orderNumber: string; isActive?: boolean } | null
  >;
}

/**
 * Turn a paid checkout into an order. Safe to call any number of times, from anywhere,
 * concurrently: it creates at most one order per payment reference.
 */
export async function fulfillCheckout(reference: string): Promise<FulfillResult> {
  await connectDB();
  if (!reference) return { status: 'no_checkout' };

  const existing = await findOrderForReference(reference);
  if (existing) return { status: 'exists', orderId: String(existing._id), orderNumber: existing.orderNumber };

  const now = new Date();
  // Claim the checkout so two callers (browser + webhook + cron) can't both create the order
  const intent = await CheckoutIntent.findOneAndUpdate(
    {
      reference,
      status: { $ne: 'completed' },
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: now } }],
    },
    { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + LOCK_MS), lastCheckedAt: now } },
    { new: true }
  );

  if (!intent) {
    const saved = await CheckoutIntent.findOne({ reference }).select('status orderId orderNumber').lean();
    if (!saved) return { status: 'no_checkout' };
    if (saved.status === 'completed' && saved.orderId) {
      return { status: 'exists', orderId: String(saved.orderId), orderNumber: String(saved.orderNumber || '') };
    }
    return { status: 'busy' };
  }

  const release = (fields: Record<string, unknown>) =>
    CheckoutIntent.updateOne({ _id: intent._id }, { $set: { lockedUntil: null, ...fields } });

  try {
    const payment = await checkPaymentForOrder(reference, intent.orderTotal);
    if (!payment.verified) {
      await release({ status: 'awaiting_payment', lastError: payment.reason || 'Payment not confirmed' });
      return { status: 'unpaid', reason: payment.reason };
    }

    // Re-check under the lock in case the order was created between the first check and the claim
    const raced = await findOrderForReference(reference);
    if (raced) {
      await release({ status: 'completed', orderId: String(raced._id), orderNumber: raced.orderNumber });
      return { status: 'exists', orderId: String(raced._id), orderNumber: raced.orderNumber };
    }

    const { order, invoice } = await createPaidOrder(
      { ...intent.payload, paymentFee: intent.paymentFee, paymentMethod: 'paystack' },
      reference
    );
    await release({ status: 'completed', orderId: String(order._id), orderNumber: order.orderNumber, lastError: null });
    console.log(`[onlinePayments] ✅ Order ${order.orderNumber} created for payment ${reference}`);
    return { status: 'created', orderId: String(order._id), orderNumber: order.orderNumber, invoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[onlinePayments] ❌ Could not create order for ${reference}:`, error);
    await release({ status: 'awaiting_payment', lastError: message }).catch(() => {});
    throw error;
  }
}

// ─── Flutterwave transaction listing ────────────────────────────────────────

export interface FlutterwaveTx {
  id: number;
  tx_ref: string;
  amount: number;
  charged_amount?: number;
  app_fee?: number;
  currency: string;
  status: string;
  payment_type?: string;
  created_at: string;
  customer?: { name?: string; email?: string; phone_number?: string };
}

/** Successful Flutterwave transactions in the last `days` days (read-only API call) */
export async function listSuccessfulFlutterwavePayments(days: number): Promise<FlutterwaveTx[]> {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('FLUTTERWAVE_SECRET_KEY not configured');

  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const all: FlutterwaveTx[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions?from=${from}&to=${to}&status=successful&page=${page}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, cache: 'no-store' }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status !== 'success') throw new Error(data?.message || `Flutterwave error ${res.status}`);
    all.push(...((data.data || []) as FlutterwaveTx[]));
    const info = data.meta?.page_info;
    if (!info || page >= info.total_pages) break;
  }
  return all.filter((t) => t.status === 'successful' && t.currency === 'NGN' && t.tx_ref?.startsWith('EMPI-'));
}

export interface UnrecordedPayment {
  reference: string;
  transactionId: number;
  amount: number;
  fee: number;
  suggestedOrderTotal: number;
  paidAt: string;
  paymentType?: string;
  customerName: string;
  email: string;
  phone: string;
  hasSavedCheckout: boolean;
  lastError?: string;
}

/**
 * Checks recent Flutterwave payments against orders. Payments with a saved checkout are turned
 * into orders automatically; the rest are returned for an admin to record.
 * Payments whose order an admin removed are NOT reported (that was a deliberate choice).
 */
export async function reconcileOnlinePayments(days = 30): Promise<{
  checked: number;
  created: { reference: string; orderNumber: string }[];
  unrecorded: UnrecordedPayment[];
}> {
  await connectDB();
  const txs = await listSuccessfulFlutterwavePayments(days);
  const refs = txs.map((t) => t.tx_ref);

  const orders = await UnifiedOrder.find({ paymentReference: { $in: refs } }).select('paymentReference').lean();
  const hasOrder = new Set(orders.map((o) => String((o as { paymentReference?: string }).paymentReference)));

  const created: { reference: string; orderNumber: string }[] = [];
  const unrecorded: UnrecordedPayment[] = [];

  for (const tx of txs) {
    if (hasOrder.has(tx.tx_ref)) continue;

    let result: FulfillResult | null = null;
    let lastError: string | undefined;
    try {
      result = await fulfillCheckout(tx.tx_ref);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (result && (result.status === 'created' || result.status === 'exists')) {
      if (result.status === 'created') created.push({ reference: tx.tx_ref, orderNumber: result.orderNumber });
      continue;
    }
    if (result?.status === 'unpaid') lastError = result.reason;

    const fee = Number(tx.app_fee) || 0;
    unrecorded.push({
      reference: tx.tx_ref,
      transactionId: tx.id,
      amount: Number(tx.amount) || 0,
      fee,
      // The customer pays the processing fee on top, so the order itself is the amount minus the fee
      suggestedOrderTotal: Math.max(0, Math.round((Number(tx.amount) || 0) - fee)),
      paidAt: tx.created_at,
      paymentType: tx.payment_type,
      customerName: tx.customer?.name || '',
      email: (tx.customer?.email || '').toLowerCase(),
      phone: tx.customer?.phone_number || '',
      hasSavedCheckout: result?.status !== 'no_checkout' && result !== null,
      ...(lastError ? { lastError } : {}),
    });
  }

  return { checked: txs.length, created, unrecorded };
}

/**
 * Admin action: record a paid Flutterwave transaction that has no saved checkout (e.g. paid
 * before this safeguard existed). The payment is re-confirmed with Flutterwave first.
 */
export async function recordPaymentAsOrder(input: {
  reference: string;
  itemsDescription: string;
  orderTotal?: number;
  adminEmail: string;
}): Promise<{ orderId: string; orderNumber: string; alreadyExisted: boolean }> {
  await connectDB();
  const reference = String(input.reference || '').trim();
  if (!reference.startsWith('EMPI-')) throw new Error('Invalid payment reference');

  const existing = await findOrderForReference(reference);
  if (existing) return { orderId: String(existing._id), orderNumber: existing.orderNumber, alreadyExisted: true };

  // A saved checkout has the real cart - always prefer it
  const auto = await fulfillCheckout(reference);
  if (auto.status === 'created' || auto.status === 'exists') {
    return { orderId: auto.orderId, orderNumber: auto.orderNumber, alreadyExisted: auto.status === 'exists' };
  }

  const txs = await listSuccessfulFlutterwavePayments(120);
  const tx = txs.find((t) => t.tx_ref === reference);
  if (!tx) throw new Error('Flutterwave has no successful payment with this reference');

  const amount = Number(tx.amount) || 0;
  const fee = Number(tx.app_fee) || 0;
  const orderTotal = Math.min(amount, Math.max(0, Math.round(Number(input.orderTotal) || amount - fee)));
  const paymentFee = Math.round((amount - orderTotal) * 100) / 100;

  const payment = await checkPaymentForOrder(reference, orderTotal);
  if (!payment.verified) throw new Error(payment.reason || 'Payment could not be confirmed with Flutterwave');

  const email = (tx.customer?.email || '').toLowerCase();
  const buyer = email ? await Buyer.findOne({ email }).lean() : null;
  const b = (buyer || {}) as Record<string, unknown>;
  const fullName = String(b.fullName || tx.customer?.name || 'Customer').trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const description = String(input.itemsDescription || '').trim() || 'Online order (items to be confirmed with customer)';

  const { order } = await createPaidOrder(
    {
      orderType: 'regular',
      firstName: firstName || 'Customer',
      lastName: rest.join(' '),
      email,
      phone: String(b.phone || tx.customer?.phone_number || ''),
      address: (b.address as string) || undefined,
      city: (b.city as string) || '',
      state: (b.state as string) || undefined,
      buyerId: buyer ? String((buyer as { _id: unknown })._id) : undefined,
      items: [{ name: description, quantity: 1, unitPrice: orderTotal, mode: 'buy' }],
      subtotal: orderTotal,
      subtotalAfterDiscount: orderTotal,
      total: orderTotal,
      paymentFee,
      paymentMethod: 'paystack',
      source: 'flutterwave_recovery',
      notes:
        `Recorded from Flutterwave payment ${reference} (transaction ${tx.id}, ${tx.payment_type || 'online'}, ` +
        `₦${amount.toLocaleString('en-NG')} paid ${new Date(tx.created_at).toISOString()}) by ${input.adminEmail}. ` +
        `The cart was not saved at checkout - confirm items, sizes and dates with the customer.`,
    },
    reference
  );
  return { orderId: String(order._id), orderNumber: order.orderNumber, alreadyExisted: false };
}
