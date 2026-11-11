"use client";

import Image from "next/image";
import { Info, Play } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { CURRENCY_RATES } from "./constants";
import { useCart } from "./CartContext";
import { useMode } from "@/app/context/ModeContext";
import { getRentLimit } from "@/lib/rentalLimits";
import { Toast } from "./Toast";
import { Portal } from "./Portal";

interface Product {
  id?: string;
  _id?: string;
  name: string;
  sellPrice: number;
  rentPrice: number;
  imageUrl: string;
  imageUrls?: string[];
  videoUrls?: string[];
  badge: string | null;
  description?: string;
  category: string;
  availableForBuy?: boolean;
  availableForRent?: boolean;
  isCostumeShow?: boolean;
  maxRentQuantity?: number | null;
}

interface ProductCardProps {
  product: Product;
  formattedPrice: string;
  currency?: string;
  compactOnMobile?: boolean;
}

export function ProductCard({ product, currency = "NGN", compactOnMobile = false }: ProductCardProps) {
  const { addItem, canAddItem } = useCart();
  const [showNotification, setShowNotification] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Get safe product ID (handle both id and _id from MongoDB)
  const productId = product.id || product._id || '';

  // Determine availability
  const isCostumeShow = product.isCostumeShow === true || product.category === 'costume-show';
  const availableForBuy = product.availableForBuy !== false; // Default true
  const availableForRent = product.availableForRent !== false && (product.rentPrice !== undefined && product.rentPrice > 0);
  const isRentalOnly = availableForRent && !availableForBuy;
  // Set initial mode based on availability
  const initialMode = !availableForBuy ? "rent" : !availableForRent ? "buy" : "buy";
  const { mode: cardMode, setMode: setCardMode } = useMode(productId, initialMode);
  const activeMode = cardMode;

  const showContent = !isCostumeShow || (availableForBuy && availableForRent);

  const handleAddToCart = () => {
    // Validate cart mode compatibility
    const validation = canAddItem(activeMode);
    if (!validation.canAdd) {
      setErrorMessage(validation.message);
      setShowError(true);
      setTimeout(() => setShowError(false), 4000);
      return;
    }

    const price = activeMode === "rent" ? product.rentPrice : product.sellPrice;

    // For rental items, default to 1 day when adding from card
    let rentalMetadata = {};
    if (activeMode === "rent") {
      const rentalDays = 1; // Default to 1 day when adding from card
      rentalMetadata = {
        rentalDays,
      };
    }

    const rentLimit = activeMode === "rent" ? getRentLimit(product) : null;
    const result = addItem({
      id: productId,
      name: product.name,
      price: price,
      image: product.imageUrl,
      mode: activeMode as "buy" | "rent",
      quantity: 1,
      ...rentalMetadata,
      ...(rentLimit !== null && { maxRentQuantity: rentLimit }),
    });

    if (result.added === 0) {
      setErrorMessage(
        rentLimit === 1
          ? "Only 1 of this costume can be rented per order — it's already in your cart."
          : `Only ${rentLimit} of this costume can be rented per order — you've reached the limit.`
      );
      setShowError(true);
      setTimeout(() => setShowError(false), 4000);
      return;
    }

    // Show notification
    setShowNotification(true);

    // Hide notification after 3 seconds
    setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  // Get all images - use imageUrls array if available, otherwise use main imageUrl
  const allImages = (product.imageUrls && product.imageUrls.length > 0)
    ? product.imageUrls
    : [product.imageUrl];

  const mainImage = allImages[0] || product.imageUrl;

  // Format price based on currency
  const formatPrice = (price: number | undefined | null) => {
    const displayVal = (price === undefined || price === null || price <= 0) ? 0 : price;
    if (displayVal === 0 && !isCostumeShow) {
      return "Price on Request";
    }
    const converted = displayVal * CURRENCY_RATES[currency].rate;
    const symbol = CURRENCY_RATES[currency].symbol;

    if (currency === "INR" || currency === "NGN") {
      return `${symbol}${converted.toFixed(0)}`;
    }
    return `${symbol}${converted.toFixed(2)}`;
  };

  const displayPrice = activeMode === "rent" ? formatPrice(product.rentPrice) : formatPrice(product.sellPrice);

  return (
    <>
      <article
        className={`group relative flex flex-col rounded-2xl md:rounded-[2.5rem] overflow-hidden transition-all duration-700 md:hover:-translate-y-2 ${!showContent ? 'bg-transparent shadow-none' : 'bg-white dark:bg-[#0a0a0a]'}`}
      >
        {/* Main Image Section */}
        <div className="relative w-full aspect-[4/5] overflow-hidden bg-gray-50 dark:bg-zinc-900/50">
          <Link href={`/product/${productId}?mode=${activeMode}`} className="block w-full h-full">
            <Image
              src={mainImage}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-1000 group-hover:scale-110"
              priority
            />
            {(product.videoUrls?.length ?? 0) > 0 && (
              <span className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                <Play className="h-3 w-3 fill-white" /> Video
              </span>
            )}
            {/* Soft Gradient Overlay for Readability */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Link>
 
          {/* Premium Costume Show Top Title Overlay */}
          {isCostumeShow && !showContent && (
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pb-12 text-white z-10 pointer-events-none">
              <h3 className="text-sm md:text-base font-bold font-playfair leading-tight text-white line-clamp-1 mb-0.5">
                {product.name}
              </h3>
              <p className="text-[10px] md:text-xs font-bold text-lime-400 font-outfit">
                {displayPrice}
              </p>
            </div>
          )}
 
          {/* Quick Info Overlay - Appears on Hover on desktop, always partially visible or accessible on mobile */}
          <div className="absolute inset-x-2 bottom-2 md:inset-x-5 md:bottom-5 z-20 flex items-center justify-between opacity-100 md:opacity-0 md:group-hover:opacity-100 translate-y-0 md:translate-y-4 md:group-hover:translate-y-0 transition-all duration-500">
            <div className="flex gap-2">
              <Link
                href={`/product/${productId}?mode=${activeMode}`}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/20 md:bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-lime-500 hover:text-slate-950 transition-colors"
                title="View Details"
              >
                <Info className="w-3 h-3 md:w-4 md:h-4" />
              </Link>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={(activeMode === "buy" && !availableForBuy) || (activeMode === "rent" && !availableForRent)}
              className="h-8 md:h-10 px-3 md:px-6 rounded-full bg-lime-500 text-slate-950 font-black text-[8px] md:text-[10px] uppercase tracking-widest shadow-xl shadow-lime-500/20 active:scale-95 transition-all"
            >
              Add
            </button>
          </div>
        </div>
 
        {/* Content Section */}
        {showContent && (
          <div className={`${compactOnMobile ? "p-2.5 sm:p-4" : "p-4"} md:p-8 flex flex-col flex-grow`}>
            <div className={`flex flex-col md:flex-row md:justify-between md:items-start gap-1 md:gap-4 ${compactOnMobile ? "mb-2.5 sm:mb-4" : "mb-4"}`}>
              <div className="flex-grow">
                <Link href={`/product/${productId}?mode=${activeMode}`}>
                  <h3 className={`${compactOnMobile ? "text-xs sm:text-lg" : "text-lg"} md:text-2xl font-black text-slate-900 dark:text-white font-playfair leading-tight hover:text-lime-600 transition-colors line-clamp-2 md:line-clamp-1`}>
                    {product.name}
                  </h3>
                </Link>
              </div>
              <p className={`${compactOnMobile ? "text-sm sm:text-lg" : "text-lg"} md:text-lg font-black text-lime-600 font-outfit shrink-0`}>
                {displayPrice}
              </p>
            </div>
 
            {/* Buy/Rent Toggle - Refined Pill Design */}
            <div className={`mt-auto ${compactOnMobile ? "pt-2.5" : "pt-4"} md:pt-6 border-t border-slate-100 dark:border-white/5 flex flex-col gap-3 md:gap-4`}>
              <div className={`${compactOnMobile ? "flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center" : "flex items-center"} justify-between`}>
                <span className={`${compactOnMobile ? "hidden sm:inline" : ""} text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500`}>Service Option</span>
                <div className="flex justify-center p-1 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10">
                  <button
                    onClick={() => availableForBuy && setCardMode("buy")}
                    disabled={!availableForBuy}
                    className={`${compactOnMobile ? "flex-1 px-2" : "px-3"} md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${cardMode === "buy"
                      ? "bg-slate-900 text-white shadow-md"
                      : "text-slate-500 hover:text-slate-900 opacity-60"
                      }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => availableForRent && setCardMode("rent")}
                    disabled={!availableForRent}
                    className={`${compactOnMobile ? "flex-1 px-2" : "px-3"} md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${cardMode === "rent"
                      ? "bg-slate-900 text-white shadow-md"
                      : "text-slate-500 hover:text-slate-900 opacity-60"
                      }`}
                  >
                    Rent
                  </button>
                </div>
              </div>
 
              {/* Availability Messaging with subtle icons */}
              {(!availableForBuy || !availableForRent) && (
                <p className={`${compactOnMobile ? "hidden sm:flex" : "flex"} items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 italic`}>
                  <span className="w-1 h-1 rounded-full bg-lime-500" />
                  {isRentalOnly ? "This exclusive piece is reserved for rental only." : "This limited edition is available for sale only."}
                </p>
              )}
            </div>
          </div>
        )}
 
        {/* Hover Highlight Border */}
        {showContent && (
          <div className="absolute inset-0 border-2 border-lime-500/0 md:group-hover:border-lime-500/10 pointer-events-none rounded-2xl md:rounded-[2.5rem] transition-colors duration-500" />
        )}
      </article>

      {/* Add to Cart Success Toast - Using Portal to escape stacking context */}
      {showNotification && (
        <Portal>
          <Toast
            message="Added to Cart!"
            subtitle={product.name}
            type="success"
            duration={3000}
            onClose={() => setShowNotification(false)}
          />
        </Portal>
      )}

      {/* Cart Mode Conflict Error Toast - Using Portal to escape stacking context */}
      {showError && (
        <Portal>
          <Toast
            message="Cannot Mix Order Types"
            subtitle={errorMessage}
            type="error"
            duration={4000}
            onClose={() => setShowError(false)}
          />
        </Portal>
      )}
    </>
  );
}
