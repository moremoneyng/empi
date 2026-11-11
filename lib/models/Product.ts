import mongoose, { Schema, Document } from 'mongoose';

export interface ISizeVariant {
  size: string;
  displayForSale: boolean;
  displayForRent: boolean;
}

export interface IColorVariant {
  colorName: string;
  colorHex?: string;
  sizes: ISizeVariant[];
}

export interface IProduct extends Document {
  name: string;
  description: string;
  sellPrice?: number;
  rentPrice?: number;
  category: string;
  costumeType?: string; // Sub-category: Angel, Carnival, Western, Traditional Africa, Cosplay, etc.
  country?: string; // For Traditional Africa costumes: Nigeria, Ghana, South Africa, Egypt, Algeria, Congo, Kenya
  badge?: string;
  imageUrl: string; // Main image (a video poster frame for video-only products)
  imageUrls: string[];
  videoUrls: string[]; // Cloudinary video URLs - a product can have images, videos, or both
  // NEW nested variants
  variants: IColorVariant[];
  // Legacy string fields (kept for backward compat with old products)
  /** @deprecated Use sizes[] array instead */
  sizesLegacy?: string;
  /** @deprecated Use colors[] array instead */
  colorLegacy?: string;
  material?: string;
  condition?: string;
  careInstructions?: string;
  // Availability flags
  availableForBuy?: boolean; // Can be purchased
  availableForRent?: boolean; // Can be rented
  isCostumeShow?: boolean; // Featured in the costume show
  // Max units of this costume a customer can rent in one order (unset/0 = no limit).
  // Costume Show products are always limited to 1 (see lib/rentalLimits.ts).
  maxRentQuantity?: number | null;
  // Delivery metadata
  deliverySize?: 'SMALL' | 'MEDIUM' | 'LARGE';
  weight?: number; // in kg
  fragile?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sizeVariantSchema = new Schema<ISizeVariant>(
  {
    size: { type: String, required: true },
    displayForSale: { type: Boolean, default: true },
    displayForRent: { type: Boolean, default: true },
  },
  { _id: false }
);

const colorVariantSchema = new Schema<IColorVariant>(
  {
    colorName: { type: String, required: true },
    colorHex: { type: String, default: '' },
    sizes: { type: [sizeVariantSchema], default: [] },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    sellPrice: { type: Number, required: false },
    rentPrice: { type: Number, default: 0, required: false },
    category: { type: String, required: true },
    costumeType: { 
      type: String, 
      enum: ['Angel', 'Carnival', 'Western', 'Traditional Africa', 'Cosplay', 'Other'],
      default: 'Other'
    },
    country: {
      type: String,
      enum: {
        values: ['Nigeria', 'Ghana', 'South Africa', 'Egypt', 'Algeria', 'Congo', 'Kenya'],
        message: 'Invalid country: must be one of Nigeria, Ghana, South Africa, Egypt, Algeria, Congo, Kenya'
      },
      default: undefined,
      sparse: true
    },
    badge: String,
    imageUrl: { type: String, required: true },
    imageUrls: [String],
    videoUrls: { type: [String], default: [] },
    // NEW nested variants
    variants: { type: [colorVariantSchema], default: [] },
    // Legacy string fields (old products may still have these)
    sizesLegacy: { type: String, default: undefined },
    colorLegacy: { type: String, default: undefined },
    material: String,
    condition: String,
    careInstructions: String,
    // Availability flags
    availableForBuy: { type: Boolean, default: true },
    availableForRent: { type: Boolean, default: true },
    isCostumeShow: { type: Boolean, default: false },
    maxRentQuantity: { type: Number, default: null, min: 0 },
    // Delivery metadata
    deliverySize: { type: String, enum: ['SMALL', 'MEDIUM', 'LARGE'], default: 'MEDIUM' },
    weight: { type: Number, default: 0.5 }, // in kg
    fragile: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for faster queries
productSchema.index({ category: 1 });
productSchema.index({ costumeType: 1 });
productSchema.index({ country: 1 });
productSchema.index({ costumeType: 1, country: 1 });
productSchema.index({ category: 1, costumeType: 1 });
productSchema.index({ isCostumeShow: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 'text' }); // text search index

// Delete cached model to ensure schema updates are loaded
if (mongoose.models.Product) {
  delete mongoose.models.Product;
}

export default mongoose.model<IProduct>('Product', productSchema);
