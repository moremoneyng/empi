import mongoose, { Schema, Document } from 'mongoose';

/**
 * A checkout saved on the server BEFORE the customer is sent to Flutterwave.
 *
 * The browser used to be the only place that knew what was in the cart, so if the customer
 * closed the tab after paying (common with bank transfers, which confirm minutes later) the
 * payment arrived but no order was ever created. With the cart stored here, the webhook,
 * the scheduled reconciliation and the browser can all turn the payment into an order.
 *
 * New collection - nothing existing is changed.
 */
export interface ICheckoutIntent extends Document {
  reference: string;            // Flutterwave tx_ref (EMPI-...)
  email: string;
  payload: Record<string, unknown>; // The exact order body the checkout would POST to /api/orders/unified
  orderTotal: number;           // Order total, excluding the processing fee
  paymentFee: number;           // Processing fee the customer pays on top
  status: 'awaiting_payment' | 'processing' | 'completed';
  lockedUntil?: Date;
  orderId?: string;
  orderNumber?: string;
  lastCheckedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const checkoutIntentSchema = new Schema<ICheckoutIntent>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    orderTotal: { type: Number, required: true },
    paymentFee: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['awaiting_payment', 'processing', 'completed'],
      default: 'awaiting_payment',
      index: true,
    },
    lockedUntil: Date,
    orderId: String,
    orderNumber: String,
    lastCheckedAt: Date,
    lastError: String,
  },
  { timestamps: true, collection: 'checkoutintents', minimize: false }
);

export default (mongoose.models.CheckoutIntent as mongoose.Model<ICheckoutIntent>) ||
  mongoose.model<ICheckoutIntent>('CheckoutIntent', checkoutIntentSchema);
