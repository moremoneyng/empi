import mongoose, { Schema, Document } from 'mongoose';

/**
 * UNIFIED ORDER MODEL
 * 
 * Single model for both custom and regular orders
 * Simplifies the system by having one source of truth
 * 
 * Usage:
 *   - Custom orders: orderType = 'custom'
 *   - Regular orders: orderType = 'regular'
 */

export interface IOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  productId?: string | null; // null for custom orders
  selectedSize?: string;
  selectedColor?: string;
  imageUrl?: string;
  image?: string; // Alternative field name for product image
  mode?: 'buy' | 'rent'; // Item mode: buy or rent
  rentalDays?: number; // Rental duration if mode is 'rent'
}

export interface IUnifiedOrder extends Document {
  // ═══════════════════════════════════════════════════════════════════
  // BASIC INFO
  // ═══════════════════════════════════════════════════════════════════
  orderNumber: string;
  orderType: 'custom' | 'regular';
  
  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER INFO
  // ═══════════════════════════════════════════════════════════════════
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  city: string;
  state?: string;
  zipCode?: string;
  country?: string;
  buyerId?: string;
  
  // ═══════════════════════════════════════════════════════════════════
  // ORDER ITEMS (unified for both types)
  // ═══════════════════════════════════════════════════════════════════
  items: IOrderItem[];
  
  // ═══════════════════════════════════════════════════════════════════
  // CUSTOM ORDER SPECIFIC
  // ═══════════════════════════════════════════════════════════════════
  description?: string;        // What customer wants
  designUrls?: string[];       // Design files uploaded
  requiredQuantity?: number;   // What customer asked for
  
  // ═══════════════════════════════════════════════════════════════════
  // QUOTE/PRICING (for custom orders)
  // ═══════════════════════════════════════════════════════════════════
  quotedPrice?: number;
  quoteItems?: Array<{ itemName: string; quantity: number; unitPrice: number; vatExempt?: boolean }>;
  
  // ═══════════════════════════════════════════════════════════════════
  // PRICING
  // ═══════════════════════════════════════════════════════════════════
  subtotal: number;
  vat: number;
  vatPercent?: number;  // VAT % charged on products only (absent on older orders)
  discountPercentage?: number;
  discountAmount?: number;
  subtotalAfterDiscount?: number;  // Subtotal after discount is applied
  shippingCost?: number;
  cautionFee?: number;  // Caution fee for rental items (50% of rental subtotal)
  total: number;
  paymentFee?: number;  // Flutterwave processing fee paid by the customer on top of total
  
  // ═══════════════════════════════════════════════════════════════════
  // PAYMENT
  // ═══════════════════════════════════════════════════════════════════
  paymentReference?: string;
  paymentMethod?: string;
  paymentVerified: boolean;
  paymentVerifiedAt?: Date;
  paymentProofUrl?: string;
  
  // ═══════════════════════════════════════════════════════════════════
  // STATUS (Simplified - only 6 states)
  // ═══════════════════════════════════════════════════════════════════
  status: 'pending' | 'approved' | 'in_production' | 'ready_for_delivery' | 'delivered' | 'cancelled';
  
  // ═══════════════════════════════════════════════════════════════════
  // RENTAL SCHEDULE (for rental orders)
  // ═══════════════════════════════════════════════════════════════════
  rentalSchedule?: {
    pickupDate: string; // ISO date string (YYYY-MM-DD)
    pickupTime: string; // HH:MM format
    returnDate: string; // ISO date string (YYYY-MM-DD)
    pickupLocation: 'iba' | 'surulere'; // Pickup branch location
    rentalDays: number; // Number of days for rental
  };
  rentalPolicyAgreed?: boolean; // Customer agreed to rental terms
  
  // ═══════════════════════════════════════════════════════════════════
  // LOGISTICS
  // ═══════════════════════════════════════════════════════════════════
  currentHandler: 'production' | 'logistics';
  handoffAt?: Date;
  deliveryOption?: 'pickup' | 'delivery';
  shippingType?: string;
  trackingNumber?: string;
  
  // ═══════════════════════════════════════════════════════════════════
  // TIMELINE
  // ═══════════════════════════════════════════════════════════════════
  deliveryDate?: Date;
  proposedDeliveryDate?: Date;
  productionStartedAt?: Date;
  
  // ═══════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  deletedAt?: Date;
  notes?: string;
  source?: string;          // 'manual_invoice' when recorded from an admin manual invoice
  invoiceNumber?: string;
}

const unifiedOrderSchema = new Schema<IUnifiedOrder>(
  {
    // Basic Info
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderType: {
      type: String,
      enum: ['custom', 'regular'],
      required: true,
      index: true,
    },
    
    // Customer Info
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      default: '',  // optional: manual-invoice customers may have a single name
    },
    email: {
      type: String,
      required: true,
      index: true,
    },
    phone: {
      type: String,
      default: '',  // optional: online checkout validates it in the API
    },
    address: String,
    city: {
      type: String,
      default: '',
    },
    state: String,
    zipCode: String,
    country: String,
    buyerId: {
      type: String,
      index: true,
    },
    
    // Order Items (unified)
    items: [
      {
        name: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        unitPrice: {
          type: Number,
          required: true,
        },
        productId: String,
        selectedSize: String,
        selectedColor: String,
        imageUrl: String,
        image: String, // Alternative field for product image (from checkout)
        mode: {
          type: String,
          enum: ['buy', 'rent'],
          default: 'buy',
        },
        rentalDays: {
          type: Number,
          default: 1,
        },
      },
    ],
    
    // Custom Order Specific
    description: String,
    designUrls: [String],
    requiredQuantity: Number,
    
    // Quote/Pricing (for custom orders)
    quotedPrice: Number,
    quoteItems: [
      {
        itemName: String,
        quantity: Number,
        unitPrice: Number,
        vatExempt: Boolean,  // true for logistics/delivery lines - no VAT charged
      },
    ],
    
    // Pricing
    subtotal: {
      type: Number,
      required: true,
    },
    vat: {
      type: Number,
      default: 0,
    },
    vatPercent: Number,
    discountPercentage: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    subtotalAfterDiscount: {
      type: Number,
      default: 0,
    },  // Subtotal after discount is applied
    shippingCost: Number,
    cautionFee: {
      type: Number,
      default: 0,
    },  // Caution fee for rental items (50% of rental subtotal)
    total: {
      type: Number,
      required: true,
    },
    paymentFee: Number,  // Flutterwave processing fee paid by the customer on top of total
    
    // Rental Schedule (for rental orders)
    rentalSchedule: {
      pickupDate: String,  // ISO date string (YYYY-MM-DD)
      pickupTime: String,  // HH:MM format
      returnDate: String,  // ISO date string (YYYY-MM-DD)
      pickupLocation: {
        type: String,
        enum: ['iba', 'surulere'],
      },
      rentalDays: Number,  // Number of days
    },
    rentalPolicyAgreed: {
      type: Boolean,
      default: false,
    },  // Customer agreed to rental terms
    
    // Payment
    paymentReference: String,
    paymentMethod: String,
    paymentVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    paymentVerifiedAt: Date,
    paymentProofUrl: String,
    
    // Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'in_production', 'ready_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    
    // Logistics
    currentHandler: {
      type: String,
      enum: ['production', 'logistics'],
      default: 'production',
      index: true,
    },
    handoffAt: Date,
    deliveryOption: {
      type: String,
      enum: ['pickup', 'delivery'],
    },
    shippingType: String,
    trackingNumber: String,
    
    // Timeline
    deliveryDate: Date,
    proposedDeliveryDate: Date,
    productionStartedAt: Date,
    
    // Metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: Date,
    notes: String,
    // Where the order came from: undefined = online checkout, 'manual_invoice' = admin manual invoice
    source: String,
    invoiceNumber: String,
  },
  {
    timestamps: true,
  }
);

// ═══════════════════════════════════════════════════════════════════
// INDEXES FOR PERFORMANCE
// ═══════════════════════════════════════════════════════════════════
unifiedOrderSchema.index({ email: 1, status: 1 });
unifiedOrderSchema.index({ orderType: 1, status: 1 });
unifiedOrderSchema.index({ currentHandler: 1, status: 1 });
unifiedOrderSchema.index({ paymentVerified: 1, status: 1 });
unifiedOrderSchema.index({ createdAt: -1 });
unifiedOrderSchema.index({ buyerId: 1, createdAt: -1 });

const UnifiedOrder =
  mongoose.models.UnifiedOrder ||
  mongoose.model<IUnifiedOrder>('UnifiedOrder', unifiedOrderSchema);

export default UnifiedOrder;
