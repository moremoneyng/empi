/**
 * SERVER-ONLY: shared order-creation steps used by the checkout API, the Flutterwave webhook,
 * the scheduled payment reconciliation and the admin "record payment" action.
 *
 * Only ever inserts new orders / invoices. Never edits or deletes existing records.
 */
import UnifiedOrder from '@/lib/models/UnifiedOrder';
import { createInvoiceFromOrder } from '@/lib/createInvoiceFromOrder';
import { getSiteUrl } from '@/lib/siteUrl';

type Body = Record<string, unknown>;

export function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Maps a checkout/order request body to a UnifiedOrder document */
export function buildOrderDocument(
  body: Body,
  opts: { orderNumber: string; orderType: string; paymentReference?: string; paymentVerified: boolean }
) {
  const { orderNumber, orderType, paymentReference, paymentVerified } = opts;
  const rentalSchedule = body.rentalSchedule as Record<string, unknown> | null | undefined;

  return {
    orderNumber,
    orderType,

    firstName: (body.firstName as string) || '',
    lastName: (body.lastName as string) || '',
    email: String(body.email || '').toLowerCase(),
    phone: (body.phone as string) || '',
    address: (body.address as string) || undefined,
    city: (body.city as string) || '',
    state: (body.state as string) || undefined,
    zipCode: (body.zipCode as string) || undefined,
    buyerId: (body.buyerId as string) || undefined,
    country: (body.country as string) || 'Nigeria',

    items:
      (body.items as Body[] | undefined)?.map((item) => ({
        name: (item.name as string) || '',
        quantity: (item.quantity as number) || 1,
        unitPrice: Number(item.unitPrice ?? item.price ?? 0),
        productId: (item.productId as string) || (item.id as string) || undefined,
        selectedSize: item.selectedSize as string | undefined,
        selectedColor: item.selectedColor as string | undefined,
        imageUrl: (item.imageUrl || item.image) as string | undefined,
        image: item.image as string | undefined,
        mode: (item.mode as string) || 'buy',
        // Keep the real rental length (previously dropped, so every rental showed as 1 day)
        rentalDays: Number(item.rentalDays) || Number(rentalSchedule?.rentalDays) || 1,
      })) || [],

    description: (body.description as string) || undefined,
    designUrls: [],
    requiredQuantity: (body.requiredQuantity as number) || (body.quantity as number) || 1,

    subtotal: (body.subtotal as number) || 0,
    discountPercentage: (body.discountPercentage as number) || 0,
    discountAmount: (body.discountAmount as number) || 0,
    subtotalAfterDiscount: (body.subtotalAfterDiscount as number) || (body.subtotal as number) || 0,
    vat: (body.vat as number) || 0,
    ...(typeof body.vatPercent === 'number' && { vatPercent: body.vatPercent }),
    total: (body.total as number) || 0,
    cautionFee: (body.cautionFee as number) || 0,
    ...(typeof body.paymentFee === 'number' && body.paymentFee > 0 && { paymentFee: body.paymentFee }),

    shippingType: (body.shippingType as string) || 'standard',
    shippingCost: (body.shippingCost as number) || 0,

    rentalSchedule: rentalSchedule
      ? {
          pickupDate: rentalSchedule.pickupDate,
          pickupTime: rentalSchedule.pickupTime,
          returnDate: rentalSchedule.returnDate,
          pickupLocation: rentalSchedule.pickupLocation,
          rentalDays: rentalSchedule.rentalDays,
        }
      : undefined,
    rentalPolicyAgreed: Boolean(body.rentalPolicyAgreed),

    paymentVerified,
    ...(paymentVerified && { paymentVerifiedAt: new Date() }),
    paymentReference,
    paymentMethod: (body.paymentMethod as string) || 'paystack',
    paymentProofUrl: (body.paymentProofUrl as string) || undefined,

    status: 'pending',
    currentHandler: 'production',

    deliveryDate: body.deliveryDate ? new Date(body.deliveryDate as string) : undefined,

    ...(body.notes ? { notes: String(body.notes) } : {}),
    ...(body.source ? { source: String(body.source) } : {}),
    isActive: true,
  };
}

/**
 * After an order is saved: invoice + email for paid orders, "order placed" email otherwise,
 * and the admin new-order notification. Never throws - order creation must not fail on these.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runPostCreateTasks(newOrder: any, orderType: string): Promise<any> {
  const baseUrl = getSiteUrl();
  const pricing = {
    subtotal: newOrder.subtotal,
    discountPercentage: newOrder.discountPercentage,
    discountAmount: newOrder.discountAmount,
    cautionFee: newOrder.cautionFee,
    vat: newOrder.vat,
    total: newOrder.total,
  };

  let invoiceData = null;
  if (newOrder.paymentVerified) {
    try {
      invoiceData = await createInvoiceFromOrder(newOrder);
    } catch (invoiceError) {
      console.error('[createOrder] ⚠️ Invoice generation failed (non-blocking):', invoiceError);
    }
  } else {
    await fetch(`${baseUrl}/api/notifications/user-status-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order-placed',
        orderNumber: newOrder.orderNumber,
        orderId: newOrder._id,
        email: newOrder.email,
        name: `${newOrder.firstName} ${newOrder.lastName}`,
        amount: newOrder.total || 0,
        details: { items: newOrder.items, pricing },
      }),
    }).catch((err) => console.error('[createOrder] ⚠️ order-placed email failed:', err));
  }

  await fetch(`${baseUrl}/api/notifications/admin-order-placed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber: newOrder.orderNumber,
      orderId: newOrder._id,
      buyerName: `${newOrder.firstName} ${newOrder.lastName}`,
      buyerEmail: newOrder.email,
      buyerPhone: newOrder.phone,
      shippingAddress: newOrder.address,
      shippingCity: newOrder.city,
      shippingState: newOrder.state,
      shippingCountry: newOrder.country,
      amount: newOrder.total || 0,
      orderType,
      items: newOrder.items,
      pricing,
    }),
  }).catch((err) => console.error('[createOrder] ⚠️ admin notification failed:', err));

  return invoiceData;
}

/** Inserts a paid online order (payment already confirmed with Flutterwave by the caller) */
export async function createPaidOrder(body: Body, paymentReference: string) {
  const orderType = (body.orderType as string) || 'regular';
  const doc = buildOrderDocument(body, {
    orderNumber: generateOrderNumber(),
    orderType,
    paymentReference,
    paymentVerified: true,
  });
  const order = await UnifiedOrder.create(doc);
  const invoice = await runPostCreateTasks(order, orderType);
  return { order, invoice };
}
