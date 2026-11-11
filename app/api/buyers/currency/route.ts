import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Buyer from '@/lib/models/Buyer';
import { getBuyerFromRequest } from '@/lib/buyerAuth';

// Update buyer's preferred currency
export async function PUT(req: NextRequest) {
  try {
    await connectDB();

    const { buyerId, currency } = await req.json();

    if (!buyerId || !currency) {
      return NextResponse.json(
        { error: 'Missing buyerId or currency' },
        { status: 400 }
      );
    }

    const sessionBuyer = await getBuyerFromRequest(req);
    if (!sessionBuyer || String(sessionBuyer._id) !== String(buyerId)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const buyer = await Buyer.findByIdAndUpdate(
      buyerId,
      { preferredCurrency: currency },
      { new: true }
    );

    if (!buyer) {
      return NextResponse.json(
        { error: 'Buyer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      currency: buyer.preferredCurrency,
    });
  } catch (error) {
    console.error('Currency update error:', error);
    return NextResponse.json(
      { error: 'Failed to update currency' },
      { status: 500 }
    );
  }
}
