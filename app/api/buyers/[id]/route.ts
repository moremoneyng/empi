import { NextRequest, NextResponse } from "next/server";
import { getBuyerFromRequest } from '@/lib/buyerAuth';
import { getAdminFromRequest } from '@/lib/adminAuth';
import connectDB from "@/lib/mongodb";
import Buyer from "@/lib/models/Buyer";
import { serializeDoc } from "@/lib/serializer";

/** Never send passwords or login sessions to the browser */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicBuyer(buyer: any) {
  const data = serializeDoc(buyer);
  for (const key of ["password", "passwordHash", "sessionToken", "sessionExpiry", "resetToken", "resetTokenExpiry", "otp", "otpExpiry"]) {
    delete data[key];
  }
  return data;
}

/**
 * GET /api/buyers/[id]
 * Fetch buyer details by ID or email
 * Query params: ?type=email (default: id)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    
    const { id } = await params;
    const queryType = request.nextUrl.searchParams.get('type') || 'id'; // 'id' or 'email'

    if (!id) {
      return NextResponse.json(
        { error: "Buyer ID or email is required" },
        { status: 400 }
      );
    }

    // Admins can look anyone up; a customer can only read their own profile
    const [sessionBuyer, admin] = await Promise.all([getBuyerFromRequest(request), getAdminFromRequest(request)]);
    if (!admin) {
      const isSelf =
        sessionBuyer &&
        (queryType === 'email'
          ? String(sessionBuyer.email).toLowerCase() === id.toLowerCase()
          : String(sessionBuyer._id) === String(id));
      if (!isSelf) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    let buyer;

    if (queryType === 'email') {
      // Search by email
      buyer = await Buyer.findOne({ email: id.toLowerCase() });
    } else {
      // Search by ID (default)
      buyer = await Buyer.findById(id);
    }

    if (!buyer) {
      return NextResponse.json(
        { error: "Buyer not found" },
        { status: 404 }
      );
    }

    const buyerData = publicBuyer(buyer);

    return NextResponse.json(buyerData, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching buyer details:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch buyer details" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/buyers/[id]
 * Update buyer profile information
 * Allows updating: fullName, phone, address, city, state, postalCode
 * Especially useful for populating missing profile fields from custom order forms
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    
    const { id } = await params;
    const body = await request.json();
    const { fullName, phone, address, city, state, postalCode } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Buyer ID is required" },
        { status: 400 }
      );
    }

    // Only the signed-in customer themselves (or an admin) may change a profile
    const [sessionBuyer, admin] = await Promise.all([getBuyerFromRequest(request), getAdminFromRequest(request)]);
    if (!admin && (!sessionBuyer || String(sessionBuyer._id) !== String(id))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    // Find buyer
    const buyer = await Buyer.findById(id);
    if (!buyer) {
      return NextResponse.json(
        { error: "Buyer not found" },
        { status: 404 }
      );
    }

    // Update only provided fields (preserves existing data)
    if (fullName !== undefined) buyer.fullName = fullName;
    if (phone !== undefined) buyer.phone = phone;
    if (address !== undefined) buyer.address = address;
    if (city !== undefined) buyer.city = city;
    if (state !== undefined) buyer.state = state;
    if (postalCode !== undefined) buyer.postalCode = postalCode;

    await buyer.save();

    console.log(`✅ Buyer profile updated: ${buyer.email}`);

    const buyerData = publicBuyer(buyer);

    return NextResponse.json(buyerData, { status: 200 });
  } catch (error: any) {
    console.error("Error updating buyer profile:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update buyer profile" },
      { status: 500 }
    );
  }
}
