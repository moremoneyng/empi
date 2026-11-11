import { normalizeMaxRentQuantity } from '@/lib/rentalLimits';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/lib/models/Product';
import { serializeDoc } from '@/lib/serializer';
import { sanitizeVideoUrls, videoPosterUrl } from '@/lib/media';
import { requireAdmin } from '@/lib/adminAuth';

// GET single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const product = await Product.findById(id);

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeDoc(product));
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Product not found' },
      { status: 404 }
    );
  }
}

// UPDATE product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.description) updateData.description = body.description;
    if (body.sellPrice !== undefined) updateData.sellPrice = body.sellPrice;
    if (body.rentPrice !== undefined) updateData.rentPrice = body.rentPrice;
    if (body.category) updateData.category = body.category;
    if (body.badge !== undefined) updateData.badge = body.badge;
    if (body.imageUrl) updateData.imageUrl = body.imageUrl;
    if (body.imageUrls) updateData.imageUrls = body.imageUrls;
    if (body.videoUrls !== undefined) updateData.videoUrls = sanitizeVideoUrls(body.videoUrls);

    // Images were all removed: keep the product valid with its videos (poster frame as main image)
    if (Array.isArray(body.imageUrls) && body.imageUrls.length === 0) {
      let videos: string[] | undefined = updateData.videoUrls;
      if (videos === undefined) {
        const existing = await Product.findById(id).select('videoUrls').lean() as { videoUrls?: string[] } | null;
        videos = existing?.videoUrls || [];
      }
      if (videos.length === 0) {
        return NextResponse.json(
          { error: 'A product needs at least one image or video' },
          { status: 400 }
        );
      }
      updateData.imageUrl = videoPosterUrl(videos[0]);
    }
    if (body.material) updateData.material = body.material;
    if (body.condition) updateData.condition = body.condition;
    if (body.careInstructions) updateData.careInstructions = body.careInstructions;
    if (body.costumeType) updateData.costumeType = body.costumeType;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.isCostumeShow !== undefined) updateData.isCostumeShow = body.isCostumeShow;
    if (body.availableForBuy !== undefined) updateData.availableForBuy = body.availableForBuy;
    if (body.availableForRent !== undefined) updateData.availableForRent = body.availableForRent;
    if (body.maxRentQuantity !== undefined) updateData.maxRentQuantity = normalizeMaxRentQuantity(body.maxRentQuantity);

    // Handle nested variants
    if (body.variants !== undefined) {
      if (Array.isArray(body.variants)) {
        updateData.variants = body.variants.map((v: any) => ({
          colorName: v.colorName || 'Default',
          colorHex: v.colorHex || '',
          sizes: Array.isArray(v.sizes) ? v.sizes.map((s: any) => ({
            size: typeof s === 'string' ? s : s.size,
            displayForSale: typeof s === 'string' ? true : s.displayForSale !== false,
            displayForRent: typeof s === 'string' ? true : s.displayForRent !== false,
          })) : []
        }));
      }
    } else {
      // Legacy fallback for PUT
      let legacySizes: any[] = [];
      if (body.sizes !== undefined) {
        if (typeof body.sizes === 'string' && body.sizes.trim()) {
          updateData.sizesLegacy = body.sizes;
          legacySizes = body.sizes.split(',').map((s: string) => ({
            size: s.trim(), displayForSale: true, displayForRent: true
          })).filter((s: any) => s.size);
        } else if (Array.isArray(body.sizes)) {
          legacySizes = body.sizes.map((s: any) => ({
            size: s.name || typeof s === 'string' ? s : '',
            displayForSale: s.displayInStore !== false,
            displayForRent: s.displayInStore !== false,
          })).filter((s: any) => s.size);
        }
      }

      let variantsData: any[] = [];
      if (body.colors !== undefined && Array.isArray(body.colors) && body.colors.length > 0) {
        variantsData = body.colors.map((c: any) => ({
          colorName: c.name || typeof c === 'string' ? c : '',
          colorHex: c.hexCode || '',
          sizes: legacySizes
        })).filter((c: any) => c.colorName);
      } else if (body.color !== undefined && typeof body.color === 'string' && body.color.trim()) {
        updateData.colorLegacy = body.color;
        const colorStrings = body.color.split(',').map((c: string) => c.trim()).filter(Boolean);
        variantsData = colorStrings.map((c: string) => ({
          colorName: c, colorHex: '', sizes: legacySizes
        }));
      } else if (legacySizes.length > 0) {
        variantsData = [{ colorName: 'Standard', colorHex: '', sizes: legacySizes }];
      }

      if (variantsData.length > 0) {
        updateData.variants = variantsData;
      }
    }

    const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeDoc(product));
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

// DELETE product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    await connectDB();
    const { id } = await params;
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Product deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
