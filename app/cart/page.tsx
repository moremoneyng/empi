// Rebuild trigger: 2026-02-10
"use client";

import { useCart } from "../components/CartContext";
import { Footer } from "../components/Footer";
import { useBuyer } from "../context/BuyerContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { DeliverySelector } from "../components/DeliverySelector";
import { RentalPolicyModal } from "../components/RentalPolicyModal";
import { DeliveryModal } from "../components/DeliveryModal";
import { RentalScheduleModal } from "../components/RentalScheduleModal";
import { ShoppingBag, Trash2, Plus, Minus, Info, ArrowLeft, AlertCircle, Truck, MapPin, Zap, Package, Edit2 } from "lucide-react";
import { AuthForm } from "../components/AuthForm";
import { CartItemDelivery, DeliveryQuote } from "@/app/lib/deliveryCalculator";
import { ItemSize } from "@/app/lib/deliverySystem";
import { EnhancedDeliverySelector } from "../components/EnhancedDeliverySelectorNew";

import { getDiscountPercentage } from "@/lib/discountCalculator";
import { calculateVat, formatVatPercent } from "@/lib/vat";
import { useVatSettings } from "@/lib/hooks/useVatSettings";

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, total, deliveryState, setDeliveryState, rentalSchedule, setRentalSchedule, deliveryQuote, setDeliveryQuote, cautionFee: contextCautionFee, getRentLimit, getRentedQuantity } = useCart();
  const { buyer, updateProfile } = useBuyer();
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  const { vatRate } = useVatSettings();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showRentalPolicy, setShowRentalPolicy] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showRentalScheduleModal, setShowRentalScheduleModal] = useState(false);
  const [shippingOption, setShippingOption] = useState<"empi" | "self">("empi");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  // Billing Information State
  const [billingInfo, setBillingInfo] = useState({
    fullName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    setIsHydrated(true);
    const saved = localStorage.getItem("empi_shipping_option");
    if (saved) setShippingOption(saved as "empi" | "self");
  }, []);

  const handleShippingChange = (option: "empi" | "self") => {
    setShippingOption(option);
    localStorage.setItem("empi_shipping_option", option);
  };

  const handleDeliveryChange = useCallback((quote: DeliveryQuote | null) => {
    setDeliveryQuote(quote);
    if (!quote) {
      setDeliveryError("Unable to calculate delivery fee");
    } else {
      setDeliveryError(null);
    }
  }, [setDeliveryQuote]);

  const handleRentalScheduleConfirm = (schedule: {
    pickupDate: string;
    pickupTime: string;
    returnDate: string;
    pickupLocation: "iba" | "surulere";
    rentalDays: number;
  }) => {
    setRentalSchedule(schedule);
    setShowRentalScheduleModal(false);
  };

  const deliveryItems = useMemo(() => items.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    size: ((item.size as any) || ItemSize.MEDIUM) as "SMALL" | "MEDIUM" | "LARGE",
    weight: item.weight || 0.5,
    totalWeight: (item.weight || 0.5) * item.quantity,
    fragile: item.fragile || false,
  })), [items]);

  // Calculate separate totals for BUY and RENTAL items
  const costBreakdown = useMemo(() => {
    let buyTotal = 0;
    let rentalTotal = 0;

    items.forEach(item => {
      if (item.mode === "buy") {
        buyTotal += item.price * item.quantity;
      } else if (item.mode === "rent") {
        // Use rentalDays from rentalSchedule, default to 1 if not set
        const days = rentalSchedule?.rentalDays || 1;
        const rentalCost = item.price * item.quantity * days;
        rentalTotal += rentalCost;
      }
    });

    // Use caution fee from cart context (50% per-costume, not per-day)
    const cautionFee = contextCautionFee;

    // Subtotal is buy items + rental items (not including caution fee)
    const subtotalBeforeCaution = buyTotal + rentalTotal;

    // Total with caution fee added
    const subtotalWithCaution = subtotalBeforeCaution + cautionFee;

    return {
      buyTotal,
      rentalTotal,
      cautionFee,
      subtotalBeforeCaution,
      subtotalWithCaution
    };
  }, [items, rentalSchedule]);

  // Calculate bulk discount - Only for BUY items
  const buyItems = items.filter(item => item.mode === 'buy');
  const totalBuyQuantity = buyItems.reduce((sum, item) => sum + item.quantity, 0);

  const discountPercentage = getDiscountPercentage(totalBuyQuantity);

  const buySubtotal = items.reduce((sum, item) => {
    if (item.mode === 'buy') {
      return sum + (item.price * item.quantity);
    }
    return sum;
  }, 0);

  const discountAmount = buySubtotal * (discountPercentage / 100);
  const buySubtotalAfterDiscount = buySubtotal - discountAmount;

  // Subtotal for VAT calculation = goods/services only (buy + rental, NO caution fee)
  const subtotalForVAT = buySubtotalAfterDiscount + costBreakdown.rentalTotal;

  // Subtotal with caution fee for final total
  const subtotalWithDiscount = subtotalForVAT + costBreakdown.cautionFee;

  const shippingCost = shippingOption === "empi" && deliveryQuote ? deliveryQuote.fee : 0;
  // VAT is only on goods/services (NOT on caution fee or delivery)
  const taxEstimate = calculateVat(subtotalForVAT, vatRate).toFixed(2);
  const totalAmount = subtotalWithDiscount + shippingCost + parseFloat(taxEstimate);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const formatPrice = (price: number | string) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
    return `${numPrice.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!isHydrated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900 flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full pt-8 sm:pt-12">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-lime-600 hover:text-lime-700 font-semibold mb-6 group transition-colors focus:outline-none"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>Go Back</span>
          </button>
          <h1 className="text-4xl font-bold mb-2">Shopping Cart</h1>
          <p className="text-gray-600">Review your items and select delivery</p>
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-16 text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-gray-100 rounded-full p-4">
                <ShoppingBag className="h-12 w-12 text-gray-400" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-6">Discover our amazing collection!</p>
            <Link href="/" className="inline-block bg-lime-600 hover:bg-lime-700 text-white px-6 py-3 rounded-lg font-semibold transition">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Items: <span className="text-2xl font-bold text-lime-600">{itemCount}</span></p>
                </div>
                <button onClick={clearCart} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition font-medium">
                  <Trash2 className="h-4 w-4" /> Clear
                </button>
              </div>

              <div className="space-y-4">
                {/* BUY ITEMS SECTION */}
                {items.some(item => item.mode === "buy") && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                      <span className="text-2xl">🛍️</span>
                      <div>
                        <h3 className="font-bold text-green-900">Buy Items</h3>
                        <p className="text-xs text-green-700">Items to keep</p>
                      </div>
                    </div>
                    {items.filter(item => item.mode === "buy").map((item) => (
                      <div key={`${item.id}-${item.mode}-${item.color || ''}-${item.size || ''}`} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                        <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">
                          {/* Image Section */}
                          <div className="flex-shrink-0 w-full md:w-32 h-32 relative rounded-xl overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center">
                            {item.image ? (
                              <Image src={item.image} alt={item.name} fill className="object-contain p-2" />
                            ) : (
                              <ShoppingBag className="h-12 w-12 text-gray-300" />
                            )}
                          </div>

                          {/* Content Section */}
                          <div className="flex-1 flex flex-col justify-between">
                            {/* Header with Title and Delete Button */}
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg md:text-xl font-bold text-gray-900 truncate">{item.name}</h3>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-green-100 text-green-700">
                                    Buy
                                  </span>
                                  {item.color && (
                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-700">
                                      Color: {item.color}
                                    </span>
                                  )}
                                  {item.size && (
                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-700">
                                      Size: {item.size}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button onClick={() => removeItem(item.id, item.mode, item.color, item.size)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition flex-shrink-0">
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>

                            {/* Footer with Controls and Price */}
                            <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
                              <div className="flex items-center border-2 border-gray-200 rounded-lg">
                                <button onClick={() => updateQuantity(item.id, item.mode, Math.max(1, item.quantity - 1), item.color, item.size)} className="p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition">
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="px-4 py-2 font-bold text-gray-900 min-w-14 text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, item.mode, item.quantity + 1, item.color, item.size)} className="p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition">
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-600 mb-1">{item.quantity} × {formatPrice(item.price)}</p>
                                <p className="text-2xl font-bold text-lime-600">{formatPrice(item.price * item.quantity)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* RENTAL ITEMS SECTION */}
                {items.some(item => item.mode === "rent") && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <span className="text-2xl">🎭</span>
                      <div>
                        <h3 className="font-bold text-blue-900">Rental Items</h3>
                        <p className="text-xs text-blue-700">Temporary rentals</p>
                      </div>
                    </div>
                    {items.filter(item => item.mode === "rent").map((item) => (
                      <div key={`${item.id}-${item.mode}-${item.color || ''}-${item.size || ''}`} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                        <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">
                          {/* Image Section */}
                          <div className="flex-shrink-0 w-full md:w-32 h-32 relative rounded-xl overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center">
                            {item.image ? (
                              <Image src={item.image} alt={item.name} fill className="object-contain p-2" />
                            ) : (
                              <ShoppingBag className="h-12 w-12 text-gray-300" />
                            )}
                          </div>

                          {/* Content Section */}
                          <div className="flex-1 flex flex-col justify-between">
                            {/* Header with Title and Delete Button */}
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg md:text-xl font-bold text-gray-900 truncate">{item.name}</h3>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-blue-100 text-blue-700">
                                    Rent
                                  </span>
                                  {item.color && (
                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-700">
                                      Color: {item.color}
                                    </span>
                                  )}
                                  {item.size && (
                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-700">
                                      Size: {item.size}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => setShowRentalPolicy(true)}
                                    className="text-xs text-blue-600 hover:text-blue-700 underline font-medium whitespace-nowrap"
                                  >
                                    View Policy
                                  </button>
                                </div>
                              </div>
                              <button onClick={() => removeItem(item.id, item.mode, item.color, item.size)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition flex-shrink-0">
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>

                            {/* Rental Schedule Details */}
                            {rentalSchedule && (
                              <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-blue-900 mb-1">Scheduled Pickup:</p>
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <span>📅</span>
                                      <span>{new Date(rentalSchedule.pickupDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <span>🕐</span>
                                      <span>{rentalSchedule.pickupTime}</span>
                                    </div>
                                  </div>
                                  <div className="bg-blue-100 rounded-lg px-3 py-2 text-center border border-blue-300">
                                    <p className="font-bold text-blue-900 text-sm">{rentalSchedule.rentalDays || 1}</p>
                                    <p className="text-blue-700">days</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Footer with Controls and Price */}
                            <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
                              <div className="flex items-center border-2 border-gray-200 rounded-lg">
                                <button onClick={() => updateQuantity(item.id, item.mode, Math.max(1, item.quantity - 1), item.color, item.size)} className="p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition">
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="px-4 py-2 font-bold text-gray-900 min-w-14 text-center">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.mode, item.quantity + 1, item.color, item.size)}
                                  disabled={getRentLimit(item.id) !== null && getRentedQuantity(item.id) >= (getRentLimit(item.id) ?? Infinity)}
                                  aria-label="Increase quantity"
                                  title={getRentLimit(item.id) !== null && getRentedQuantity(item.id) >= (getRentLimit(item.id) ?? Infinity) ? `Rental limit reached (max ${getRentLimit(item.id)} per order)` : undefined}
                                  className="p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              {getRentLimit(item.id) !== null && (
                                <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                                  Max {getRentLimit(item.id)} per order
                                </p>
                              )}
                              <div className="text-right">
                                <p className="text-xs text-gray-600 mb-1">{item.quantity} × {formatPrice(item.price)}/day × {rentalSchedule?.rentalDays || 1} days</p>
                                <p className="text-2xl font-bold text-lime-600">{formatPrice((item.price * item.quantity * (rentalSchedule?.rentalDays || 1)))}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Summary Card - Only shows when EMPI selected and quote available */}
              {shippingOption === "empi" && deliveryQuote && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Truck className="h-5 w-5 text-lime-600" /> Delivery Details
                  </h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-lime-600" />
                        Distance:
                      </span>
                      <span className="font-semibold text-gray-900">{(deliveryQuote.distance || 0).toFixed(1)} km</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-lime-600" />
                        Estimated Time:
                      </span>
                      <span className="font-semibold text-gray-900">{deliveryQuote.duration || 'Calculating...'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-sm font-semibold text-gray-700">Delivery Fee:</span>
                      <span className="font-bold text-lime-600">₦{(deliveryQuote.fee || 0).toLocaleString('en-NG')}</span>
                    </div>
                    <button
                      onClick={() => setShowDeliveryModal(true)}
                      className="w-full mt-3 px-4 py-2 border border-lime-600 text-lime-600 rounded-lg font-medium hover:bg-lime-50 transition"
                    >
                      Edit Delivery Details
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 md:p-8 py-6 md:py-8 sticky top-32">
                <h2 className="text-2xl font-bold mb-6">Order Summary</h2>
                <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                  {/* Buy Items Total */}
                  {costBreakdown.buyTotal > 0 && (
                    <div className="space-y-2">
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex justify-between mb-1">
                          <span className="text-green-700 font-semibold flex items-center gap-2">
                            🛍️ Buy Items
                          </span>
                          <span className="text-green-700 font-bold">{formatPrice(costBreakdown.buyTotal)}</span>
                        </div>
                      </div>

                      {/* Bulk Discount (if applicable) - Under Buy Items */}
                      {discountPercentage > 0 && (
                        <div className="bg-green-100 rounded-lg p-2 border border-green-300 ml-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <p className="text-xs font-semibold text-green-700">🎁 Discount ({discountPercentage}%)</p>
                            <p className="font-bold text-green-700 text-sm">-₦{discountAmount.toLocaleString()}</p>
                          </div>
                          <p className="text-xs text-green-600">{totalBuyQuantity} buy items</p>

                          {/* Subtotal after discount */}
                          <div className="border-t border-green-300 pt-2 flex justify-between items-center">
                            <p className="text-xs font-semibold text-green-800">After Discount</p>
                            <p className="font-bold text-green-800">₦{buySubtotalAfterDiscount.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rental Items Total */}
                  {costBreakdown.rentalTotal > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 space-y-3">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-blue-700 font-semibold flex items-center gap-2">
                          🎭 Rental Items
                        </span>
                        <span className="text-blue-700 font-bold text-lg">{formatPrice(costBreakdown.rentalTotal)}</span>
                      </div>

                      {/* Schedule Info/Button Section */}
                      {rentalSchedule ? (
                        <div className="bg-white rounded-lg p-3 border-2 border-green-400 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-green-700">✓ Schedule Set</span>
                            <button
                              onClick={() => setShowRentalScheduleModal(true)}
                              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition"
                            >
                              Edit
                            </button>
                          </div>
                          <div className="space-y-1 text-sm text-gray-700">
                            <div className="flex items-center gap-2">
                              <span>📅</span>
                              <span>{new Date(rentalSchedule.pickupDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>🕐</span>
                              <span>{rentalSchedule.pickupTime}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>↩️</span>
                              <span>{new Date(rentalSchedule.returnDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>�</span>
                              <span className="font-semibold text-blue-700">{rentalSchedule.rentalDays} {rentalSchedule.rentalDays === 1 ? 'day' : 'days'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>�📍</span>
                              <span className="text-xs">22 Ejire Street, Surulere</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowRentalScheduleModal(true)}
                          className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-gray-900 font-bold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm"
                        >
                          <Edit2 className="h-4 w-4" />
                          Set Pickup Schedule
                        </button>
                      )}
                    </div>
                  )}

                  {/* Caution Fee */}
                  {costBreakdown.cautionFee > 0 && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <div className="flex justify-between">
                        <span className="text-amber-700 font-semibold flex items-center gap-2">
                          🛡️ Caution Fee (50%)
                        </span>
                        <span className="text-amber-700 font-bold">{formatPrice(costBreakdown.cautionFee)}</span>
                      </div>
                      <p className="text-xs text-amber-600 mt-1">Applied on rental items total</p>
                    </div>
                  )}

                  {/* Subtotal with Caution */}
                  <div className="flex justify-between pt-2 font-semibold text-gray-900 text-lg border-t border-gray-300">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotalWithDiscount)}</span>
                  </div>

                  {/* Shipping */}
                  {/* Delivery row intentionally hidden; delivery handled separately */}

                  {/* VAT */}
                  <div className="flex justify-between text-sm"><span className="text-gray-600">VAT ({formatVatPercent(vatRate)})</span><span>{formatPrice(parseFloat(taxEstimate))}</span></div>
                </div>
                <div className="flex justify-between items-center mb-6 text-xl">
                  <span className="font-semibold">Total</span><span className="font-bold text-lime-600">{formatPrice(totalAmount)}</span>
                </div>



                <button onClick={() => { buyer ? router.push("/checkout") : setShowAuthModal(true); }} className="block w-full bg-lime-600 hover:bg-lime-700 text-white font-bold py-3 px-4 rounded-lg text-center transition mb-3 disabled:opacity-50 disabled:cursor-not-allowed" disabled={items.some(i => i.mode === 'rent') && !rentalSchedule ? true : false}>
                  Proceed to Checkout
                </button>

                {/* Helper message when button is disabled */}
                {(items.some(i => i.mode === 'rent') && !rentalSchedule) && (
                  <div className="bg-purple-50 border-l-4 border-purple-600 p-3 mb-3 rounded">
                    <p className="text-sm text-purple-900 font-semibold">
                      ⏰ Please fill the Rental Schedule form to proceed to checkout
                    </p>
                  </div>
                )}

                <Link href="/" className="block w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50 font-semibold py-3 px-4 rounded-lg text-center transition">
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      {showAuthModal && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAuthModal(false)}>
        <AuthForm redirectToCheckout={true} onCancel={() => setShowAuthModal(false)} />
      </div>}

      {/* Delivery Modal - Desktop and Mobile */}
      <DeliveryModal
        isOpen={showDeliveryModal}
        onClose={() => setShowDeliveryModal(false)}
        onConfirm={(deliveryData) => {
          // Save delivery details to buyer profile
          if (buyer) {
            updateProfile({
              deliveryDetails: {
                selectedState: deliveryData.selectedState,
                vehicleType: deliveryData.vehicleType,
                deliveryAddress: deliveryData.deliveryAddress,
                pickupLocation: deliveryData.pickupLocation,
                useGPS: deliveryData.deliveryAddress === 'GPS Location',
                manualAddress: deliveryData.deliveryAddress !== 'GPS Location' ? deliveryData.deliveryAddress : undefined,
                rushDelivery: false,
                weekendDelivery: false,
                lastUpdated: new Date().toISOString(),
              },
            });
          }

          // Set delivery quote
          handleDeliveryChange(deliveryData.quote);

          // Close modal
          setShowDeliveryModal(false);
        }}
        items={deliveryItems}
      />

      <RentalPolicyModal isOpen={showRentalPolicy} onClose={() => setShowRentalPolicy(false)} />

      <RentalScheduleModal
        isOpen={showRentalScheduleModal}
        onClose={() => setShowRentalScheduleModal(false)}
        onConfirm={handleRentalScheduleConfirm}
        rentalDays={Math.ceil((items.filter(i => i.mode === "rent").reduce((max, i) => Math.max(max, i.rentalDays || 1), 1)))}
        productName="All Rental Items"
      />
    </div>
  );
}
