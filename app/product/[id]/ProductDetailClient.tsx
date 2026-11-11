"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, ArrowLeft, ChevronLeft, ChevronRight, AlertCircle, X, Check, Play } from "lucide-react";
import { getProductMedia } from "@/lib/media";
import { CURRENCY_RATES } from "@/app/components/constants";
import { useCart } from "@/app/components/CartContext";
import { useMode } from "@/app/context/ModeContext";
import { getRentLimit as getProductRentLimit } from "@/lib/rentalLimits";

import { Toast } from "@/app/components/Toast";
import { Portal } from "@/app/components/Portal";
import { ScrollReveal } from "@/app/components/ScrollReveal";

const colorDictionary: Record<string, string> = {
  burgundy: "#800020",
  emerald: "#50c878",
  ruby: "#e0115f",
  sapphire: "#0f52ba",
  rose: "#ff007f",
  mint: "#3eb489",
  mustard: "#e1ad01",
  wine: "#722f37",
  champagne: "#f7e7ce",
  cream: "#fffdd0",
  apricot: "#fbceb1",
  mauve: "#e0b0ff",
  amber: "#ffbf00",
  bronze: "#cd7f32",
  copper: "#b87333",
  brass: "#b5a642",
  rust: "#b7410e",
  "rose gold": "#b76e79",
  "rosegold": "#b76e79",
  "emerald green": "#50c878",
  "royal blue": "#4169e1",
  "sky blue": "#87ceeb",
  "navy blue": "#000080",
  "forest green": "#228b22",
  "hot pink": "#ff69b4",
  "dark red": "#8b0000",
  "light blue": "#add8e6",
  gold: "#ffd700",
  silver: "#c0c0c0",
  black: "#111111",
  white: "#f5f5f5",
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#6b7280",
  brown: "#92400e",
};

export function getVariantColorStyle(name: string): React.CSSProperties {
  const normalized = name.trim().toLowerCase();
  
  if (colorDictionary[normalized]) {
    return { backgroundColor: colorDictionary[normalized] };
  }
  
  if (typeof window !== 'undefined' && CSS.supports('color', normalized)) {
    return { backgroundColor: normalized };
  }
  
  const charCode = normalized.charCodeAt(0) || 0;
  const hue = (charCode * 7) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${(hue + 40) % 360}, 70%, 45%))`,
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '0.55rem',
  };
}

interface Product {
  id: string;
  _id?: string;
  name: string;
  description?: string | null;
  sellPrice: number;
  rentPrice: number;
  category: string;
  costumeType?: string | null;
  country?: string | null;
  badge?: string | null;
  imageUrl: string;
  imageUrls: string[];
  videoUrls?: string[];
  variants?: any;
  sizes?: string | any[] | null;
  colors?: string | any[] | null;
  color?: string | null;
  material?: string | null;
  condition?: string | null;
  careInstructions?: string | null;
  availableForBuy?: boolean;
  availableForRent?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  product: any;
  allProducts: any[];
  currency?: string;
}

export default function ProductDetailClient({ product, allProducts, currency = "NGN" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addItem, items, canAddItem, getRentedQuantity } = useCart();

  // Get safe product ID first
  const productId = product.id || product._id || '';

  // Now use the productId with useMode
  const { mode, setMode, isHydrated } = useMode(productId);
  const isCostumeShow = product.isCostumeShow === true || product.category === 'costume-show';

  // Load mode from URL params only on initial mount
  useEffect(() => {
    const urlMode = searchParams.get('mode') as 'buy' | 'rent';
    if (urlMode && isHydrated) {
      setMode(urlMode);
    } else if (isHydrated) {
      const defaultMode = product.availableForBuy !== false ? "buy" : "rent";
      setMode(defaultMode);
    }
  }, [productId, isHydrated, product.availableForBuy]);

  const [rawQuantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showRentalPolicy, setShowRentalPolicy] = useState(false);
  const [cartConflict, setCartConflict] = useState<{ hasConflict: boolean; message: string }>({ hasConflict: false, message: "" });
  const [isDescExpanded, setIsDescExpanded] = useState(false);

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

  const displayPrice = mode === "rent" ? formatPrice(product.rentPrice) : formatPrice(product.sellPrice);

  let variants: any[] = [];
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    variants = product.variants;
  } else {
    // Migration logic
    let legacySizes: any[] = [];
    if (Array.isArray(product.sizes)) {
      legacySizes = product.sizes.filter((s: any) => s.displayInStore !== false).map((s: any) => ({
        size: s.name || (typeof s === 'string' ? s : ''),
        displayForSale: true,
        displayForRent: true,
      })).filter((s: any) => s.size);
    } else if (typeof product.sizes === 'string' && product.sizes.trim()) {
      legacySizes = product.sizes.split(",").map((s: string) => ({
        size: s.trim(), displayForSale: true, displayForRent: true
      })).filter((s: any) => s.size);
    }

    if (Array.isArray(product.colors) && product.colors.length > 0) {
      variants = product.colors.filter((c: any) => c.displayInStore !== false).map((c: any) => ({
        colorName: c.name || (typeof c === 'string' ? c : ''),
        colorHex: c.hexCode || '',
        sizes: legacySizes
      })).filter((c: any) => c.colorName);
    } else if (typeof product.color === 'string' && product.color.trim()) {
      variants = product.color.split(",").map((c: string) => ({
        colorName: c.trim(), colorHex: '', sizes: legacySizes
      })).filter((c: any) => c.colorName);
    } else if (legacySizes.length > 0) {
      variants = [{ colorName: 'Standard', colorHex: '', sizes: legacySizes }];
    }
  }

  const [selectedColorName, setSelectedColorName] = useState(variants.length > 0 ? variants[0].colorName : "");
  
  const activeVariant = variants.find((v: any) => v.colorName === selectedColorName);
  const hasAnySizesForColor = activeVariant?.sizes && activeVariant.sizes.length > 0;
  const displayedSizes = activeVariant?.sizes?.filter((s: any) => 
    mode === 'buy' ? s.displayForSale !== false : s.displayForRent !== false
  ) || [];

  const [selectedSizes, setSelectedSizes] = useState<Record<string, number>>({});

  // Rental stock limit (Costume Show = 1; otherwise whatever the admin set, or no limit)
  const rentLimit = mode === "rent" ? getProductRentLimit(product) : null;
  const rentedInCart = rentLimit !== null ? getRentedQuantity(productId) : 0;
  const rentRemaining = rentLimit !== null ? Math.max(0, rentLimit - rentedInCart) : Infinity;
  const selectedSizeTotal = Object.values(selectedSizes).reduce((sum, q) => sum + q, 0);
  const rentLimitReached = rentLimit !== null && rentRemaining <= 0;

  // Keep the plain quantity selector inside the limit (e.g. after switching to rent mode)
  const quantity = rentLimit !== null ? Math.min(rawQuantity, Math.max(1, rentRemaining)) : rawQuantity;

  useEffect(() => {
    // Reset selected sizes when color or mode changes, or auto-select if only 1 size
    if (displayedSizes.length === 1) {
      setSelectedSizes({ [displayedSizes[0].size]: 1 });
    } else {
      setSelectedSizes({});
    }
  }, [selectedColorName, mode, displayedSizes.length]);

  const showLimitMessage = (message: string) => {
    setCartConflict({ hasConflict: true, message });
    setTimeout(() => setCartConflict({ hasConflict: false, message: "" }), 4000);
  };

  const limitText = (limit: number) =>
    limit === 1
      ? `Only 1 of this costume can be rented per order.`
      : `Only ${limit} of this costume can be rented per order.`;

  const handleSizeClick = (size: string) => {
    if (selectedSizes[size] === undefined && rentLimit !== null && selectedSizeTotal + 1 > rentRemaining) {
      showLimitMessage(rentLimitReached ? `${limitText(rentLimit)} It's already in your cart.` : limitText(rentLimit));
      return;
    }
    setSelectedSizes(prev => {
      const updated = { ...prev };
      if (updated[size] !== undefined) {
        delete updated[size];
      } else {
        updated[size] = 1;
      }
      return updated;
    });
  };

  const handleSizeQtyChange = (size: string, newQty: number) => {
    if (newQty < 1) return;
    const current = selectedSizes[size] || 0;
    if (rentLimit !== null && newQty > current && selectedSizeTotal - current + newQty > rentRemaining) {
      showLimitMessage(limitText(rentLimit));
      return;
    }
    setSelectedSizes(prev => ({
      ...prev,
      [size]: newQty
    }));
  };

  const handleAddToCart = () => {
    // Validate cart mode compatibility
    const validation = canAddItem(mode);
    if (!validation.canAdd) {
      setCartConflict({ hasConflict: true, message: validation.message });
      setTimeout(() => setCartConflict({ hasConflict: false, message: "" }), 4000);
      return;
    }

    if (rentLimit !== null) {
      const requested = displayedSizes.length > 0 ? selectedSizeTotal : quantity;
      if (rentRemaining <= 0) {
        showLimitMessage(`${limitText(rentLimit)} It's already in your cart.`);
        return;
      }
      if (requested > rentRemaining) {
        showLimitMessage(`${limitText(rentLimit)} You can add ${rentRemaining} more.`);
        return;
      }
    }

    const price = mode === "rent" ? product.rentPrice : product.sellPrice;
    if (!price || price <= 0) {
      setCartConflict({ hasConflict: true, message: "This item cannot be added to cart without a price" });
      setTimeout(() => setCartConflict({ hasConflict: false, message: "" }), 4000);
      return;
    }
    const productImage = product.imageUrl || (product.imageUrls && product.imageUrls[0]) || '';

    // If sizes are available, add each selected size
    if (displayedSizes.length > 0) {
      const selectedSizeEntries = Object.entries(selectedSizes);
      if (selectedSizeEntries.length === 0) {
        setCartConflict({ hasConflict: true, message: "Please select at least one size" });
        setTimeout(() => setCartConflict({ hasConflict: false, message: "" }), 3000);
        return;
      }

      console.log('[ProductDetail] Adding multiple sizes to cart:', selectedSizeEntries);
      selectedSizeEntries.forEach(([size, qty]) => {
        const cartItem: any = {
          id: productId,
          name: product.name,
          price: price,
          image: productImage,
          mode: mode as "buy" | "rent",
          quantity: qty,
          color: selectedColorName,
          size: size,
          ...(rentLimit !== null && { maxRentQuantity: rentLimit }),
        };
        addItem(cartItem);
      });
    } else {
      // Fallback for products without sizes
      const cartItem: any = {
        id: productId,
        name: product.name,
        price: price,
        image: productImage,
        mode: mode as "buy" | "rent",
        quantity: quantity,
        color: selectedColorName,
        size: "",
        ...(rentLimit !== null && { maxRentQuantity: rentLimit }),
      };
      console.log('[ProductDetail] Adding product without sizes to cart:', cartItem);
      addItem(cartItem);
    }

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 3000);
  };

  // Photos and videos share one gallery
  const media = getProductMedia(product);
  const activeMedia = media[currentImageIndex] ?? media[0];

  const nextImage = () => {
    if (media.length > 0) {
      setCurrentImageIndex((p) => (p + 1) % media.length);
    }
  };

  const prevImage = () => {
    if (media.length > 0) {
      setCurrentImageIndex((p) => (p - 1 + media.length) % media.length);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] transition-colors duration-700">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-4 flex items-center justify-between">
          <Link href="/product" className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-lime-600 dark:hover:text-lime-400 transition font-bold text-xs uppercase tracking-widest group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition" /> Back to Products
          </Link>
          <button onClick={() => router.push('/cart')} className="flex items-center gap-2 bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700 text-white px-4 py-2.5 rounded-xl font-semibold transition shadow-lg hover:shadow-xl relative">
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden sm:inline">Cart</span>
            {items.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                {items.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-0 md:px-6 py-0 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16">
          {/* Image Gallery */}
          <div className="flex flex-col gap-6">
            {/* Main Image */}
            <div className="relative rounded-none md:rounded-3xl overflow-hidden aspect-[4/5] transition-all duration-500">
              {activeMedia?.type === 'video' ? (
                <video
                  key={activeMedia.url}
                  src={activeMedia.url}
                  poster={activeMedia.thumbnail}
                  controls
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                />
              ) : activeMedia ? (
                <Image
                  src={activeMedia.url}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  quality={90}
                />
              ) : null}
              {product.badge && (
                <div className="absolute top-4 right-4 bg-gradient-to-r from-lime-500 via-green-500 to-emerald-600 text-white text-sm font-black px-4 py-2 rounded-full shadow-xl transform -rotate-1 hover:rotate-0 transition">
                  ✨ {product.badge}
                </div>
              )}

              {/* Image Navigation */}
              {media.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-black/90 backdrop-blur-md p-4 rounded-full z-10 shadow-xl transition-all hover:scale-110 active:scale-95 group/btn"
                    title="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6 text-gray-900 dark:text-white group-hover/btn:text-lime-600 dark:group-hover/btn:text-lime-400" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-black/90 backdrop-blur-md p-4 rounded-full z-10 shadow-xl transition-all hover:scale-110 active:scale-95 group/btn"
                    title="Next image"
                  >
                    <ChevronRight className="h-6 w-6 text-gray-900 dark:text-white group-hover/btn:text-lime-600 dark:group-hover/btn:text-lime-400" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {media.length > 1 && (
              <div className="grid grid-cols-5 gap-2 px-4 md:px-0">
                {media.map((item, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative aspect-square rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer transform hover:scale-105 ${idx === currentImageIndex
                      ? 'border-lime-500 ring-4 ring-lime-500/20 shadow-lg'
                      : 'border-gray-100 dark:border-white/10 hover:border-lime-500/50'
                      }`}
                  >
                    <Image
                      src={item.thumbnail}
                      alt={`${product.name} - ${item.type === 'video' ? 'Video' : 'Image'} ${idx + 1}`}
                      fill
                      className="object-cover hover:scale-110 transition"
                      sizes="100px"
                      quality={75}
                    />
                    {item.type === 'video' && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="flex flex-col justify-start gap-8 px-4 md:px-0">
            {/* Header: Category + Title + Price */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-block text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 bg-lime-50 dark:bg-lime-950/30 text-lime-700 dark:text-lime-400 rounded-full border border-lime-100 dark:border-lime-900/30">
                  {product.category === 'kids' ? '👶 Kids Boutique' : '👔 Elite Adults'}
                </span>
                {product.costumeType && (
                  <span className="inline-block text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-full border border-gray-100 dark:border-white/5">
                    🎭 {product.costumeType}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h1 className="text-xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight font-playfair tracking-tight">
                  {product.name}
                </h1>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xl md:text-3xl font-black text-lime-600 font-outfit tracking-tight">
                    {displayPrice}
                  </span>
                  {mode === 'rent' && (
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">/ day</span>
                  )}
                </div>
              </div>
            </div>

            {/* Buy/Rent Mode Toggle & Pricing Panel (Only rendered if toggle tabs or rental policy needs to be displayed) */}
            {((product.availableForBuy !== false && product.availableForRent !== false && product.rentPrice > 0) || (mode === 'rent' && product.rentPrice > 0)) && (
              <div className="bg-gray-50 dark:bg-white/5 rounded-3xl p-6 border border-gray-100 dark:border-white/5 space-y-6">
                {/* Tabs */}
                {product.availableForBuy !== false && product.availableForRent !== false && product.rentPrice > 0 && (
                  <div className="flex bg-white dark:bg-black/40 p-1.5 rounded-2xl border border-gray-100 dark:border-white/5">
                    {product.availableForBuy !== false && (
                      <button
                        onClick={() => setMode("buy")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${mode === "buy"
                          ? "bg-lime-600 text-white shadow-lg shadow-lime-600/20"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                          }`}
                      >
                        <span>🛒</span> Purchase
                      </button>
                    )}
                    {product.availableForRent !== false && product.rentPrice > 0 && (
                      <button
                        onClick={() => setMode("rent")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${mode === "rent"
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                          }`}
                      >
                        <span>🔑</span> Rental
                      </button>
                    )}
                  </div>
                )}

                {/* Rental Policy Alert */}
                {mode === 'rent' && product.rentPrice > 0 && (
                  <button
                    onClick={() => setShowRentalPolicy(true)}
                    className="w-full flex items-center justify-between p-3.5 bg-blue-600/5 dark:bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 transition"
                  >
                    <span className="flex items-center gap-2">📋 View Rental Policy</span>
                    <span>Read Rules →</span>
                  </button>
                )}
              </div>
            )}

            {/* Colors & Sizes Selector */}
            {variants.length > 0 && (
              <div className="space-y-6">
                {/* Color Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">
                      Colors
                    </span>
                    <span className="text-xs font-bold text-gray-400">{selectedColorName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {variants.map((variant: any, idx: number) => {
                      const isSelected = selectedColorName === variant.colorName;
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedColorName(variant.colorName)}
                          className={`group relative flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl border-2 transition-all font-bold text-xs uppercase tracking-wider ${
                            isSelected
                              ? 'border-lime-500 bg-lime-50/50 dark:bg-lime-950/20 text-lime-700 dark:text-lime-400 shadow-md shadow-lime-500/5'
                              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                          }`}
                        >
                          <div
                            className="w-5 h-5 rounded-full border border-gray-200 dark:border-white/20 shadow-inner flex-shrink-0 flex items-center justify-center relative overflow-hidden"
                            style={getVariantColorStyle(variant.colorName)}
                          >
                            {isSelected && (
                              <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white stroke-[3px]" />
                              </div>
                            )}
                          </div>
                          <span>{variant.colorName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Size Section */}
                {hasAnySizesForColor && (
                  displayedSizes.length > 0 ? (
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">
                            Sizes
                          </span>
                          <span className="text-xs font-bold text-gray-400">
                            {Object.keys(selectedSizes).length > 0
                              ? `Selected: ${Object.keys(selectedSizes).join(", ")}`
                              : "Choose sizes (you can select multiple)"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {displayedSizes.map((sz: any, idx: number) => {
                            const isSelected = selectedSizes[sz.size] !== undefined;
                            return (
                              <button
                                key={idx}
                                onClick={() => handleSizeClick(sz.size)}
                                className={`min-w-[3.5rem] px-5 py-3 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-wider text-center ${
                                  isSelected
                                    ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black shadow-md shadow-black/10'
                                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                                }`}
                              >
                                {sz.size}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Quantity selectors per selected size */}
                      {Object.keys(selectedSizes).length > 0 && (
                        <div className="space-y-3 bg-gray-50 dark:bg-white/5 rounded-3xl p-5 border border-gray-100 dark:border-white/5 animate-in fade-in duration-300">
                          <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em] block mb-2">
                            Quantities per Size
                          </span>
                          <div className="space-y-2">
                            {Object.entries(selectedSizes).map(([size, qty]) => (
                              <div key={size} className="flex items-center justify-between bg-white dark:bg-[#151515] p-3 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                <span className="font-bold text-gray-800 dark:text-gray-200 text-xs">
                                  Size <strong className="text-lime-600 dark:text-lime-400 text-sm ml-1">{size}</strong>
                                </span>
                                <div className="flex items-center bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 p-0.5">
                                  <button
                                    onClick={() => handleSizeQtyChange(size, qty - 1)}
                                    disabled={qty <= 1}
                                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/5 rounded-lg transition font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center font-black text-gray-900 dark:text-white text-xs">
                                    {qty}
                                  </span>
                                  <button
                                    onClick={() => handleSizeQtyChange(size, qty + 1)}
                                    disabled={rentLimit !== null && selectedSizeTotal >= rentRemaining}
                                    aria-label={`Increase quantity for size ${size}`}
                                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/5 rounded-lg transition font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      No sizes available for {selectedColorName} in {mode} mode.
                    </div>
                  )
                )}
              </div>
            )}

            {/* Quantity and Actions */}
            <div className="pt-2 border-t border-gray-100 dark:border-white/5 space-y-4">
              {rentLimit !== null && (
                <div
                  className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs font-semibold ${
                    rentLimitReached
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                      : 'border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
                  }`}
                  role="status"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>
                    {isCostumeShow ? 'Costume Show piece — ' : 'Limited stock — '}
                    {rentLimit === 1 ? 'only 1 can be rented per order.' : `up to ${rentLimit} can be rented per order.`}
                    {rentedInCart > 0 && (rentLimitReached ? ' It is already in your cart.' : ` ${rentedInCart} already in your cart.`)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4">
                {/* Quantity input */}
                {displayedSizes.length === 0 && (
                  <div className="flex items-center bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 p-1">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/5 rounded-xl transition font-bold"
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-black text-gray-900 dark:text-white text-sm">
                      {quantity}
                    </span>
                    <button
                      onClick={() => {
                        if (rentLimit !== null && quantity + 1 > rentRemaining) {
                          showLimitMessage(limitText(rentLimit));
                          return;
                        }
                        setQuantity(quantity + 1);
                      }}
                      disabled={rentLimit !== null && quantity >= rentRemaining}
                      aria-label="Increase quantity"
                      className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/5 rounded-xl transition font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                )}
                
                {/* Add to Cart Button */}
                <div className="flex-1">
                  {(mode === 'buy' && (isCostumeShow || (product.availableForBuy !== false && product.sellPrice && product.sellPrice > 0))) || (mode === 'rent' && product.availableForRent !== false && product.rentPrice && product.rentPrice > 0) ? (
                    <button
                      onClick={handleAddToCart}
                      disabled={rentLimitReached}
                      className={`w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 ${
                        mode === 'buy'
                          ? 'bg-lime-600 hover:bg-lime-500 text-white shadow-lime-600/20'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                      }`}
                    >
                      <ShoppingCart className="h-4 w-4" /> {rentLimitReached ? 'Already in Cart' : 'Add to Cart'}
                    </button>
                  ) : (
                    <div className="w-full py-4 px-6 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed border border-gray-200 dark:border-white/5">
                      <AlertCircle className="h-4 w-4" />
                      Unavailable
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div className="pt-4 border-t border-gray-100 dark:border-white/5 space-y-3">
                <p className={`text-gray-600 dark:text-gray-400 text-sm md:text-base leading-relaxed font-medium transition-all ${isDescExpanded ? '' : 'line-clamp-3'}`}>
                  {product.description}
                </p>
                {product.description.length > 150 && (
                  <button
                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                    className="text-xs font-black text-lime-600 dark:text-lime-400 hover:text-lime-700 dark:hover:text-lime-300 transition flex items-center gap-1 uppercase tracking-wider"
                  >
                    {isDescExpanded ? (
                      <>Show Less ▴</>
                    ) : (
                      <>Read Full Description ▾</>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Related Products */}
      {allProducts.length > 1 && (
        <ScrollReveal y={40}>
          <section className="bg-white dark:bg-[#0a0a0a] border-t border-gray-100 dark:border-white/5 transition-colors duration-700">
            <div className="mx-auto max-w-7xl px-4 md:px-6 py-20 md:py-32">
              <h2 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.4em] mb-12 flex items-center gap-3 justify-center">
                <span>✨</span> Curated Recommendations
              </h2>
              <div className="grid gap-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {allProducts
                  .filter(p => (p.id || p._id) !== productId && p.category === product.category)
                  .slice(0, 4)
                  .map(p => {
                    const pId = p.id || p._id;
                    return (
                      <Link key={pId} href={`/product/${pId}`}>
                        <div className="group bg-transparent transition-all duration-500 cursor-pointer flex flex-col transform">
                          <div className="relative w-full aspect-[4/5] rounded-3xl overflow-hidden bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 mb-6">
                            <Image
                              src={p.imageUrl}
                              alt={p.name}
                              fill
                              className="object-cover group-hover:scale-110 transition-all duration-700"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-500" />
                          </div>
                          <div className="flex flex-col text-center">
                            <h3 className="font-black text-gray-900 dark:text-white text-xs uppercase tracking-widest mb-2 line-clamp-1">{p.name}</h3>
                            <p className="text-sm font-black text-lime-600 dark:text-lime-400">{formatPrice(p.sellPrice)}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* Rental Policy Modal */}
      {showRentalPolicy && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-[#0a0a0a] rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-white/5">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 p-8 flex items-center justify-between z-10">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-gray-900 dark:text-white flex items-center gap-3">
                <span>📋</span> Boutique Rental Policy
              </h2>
              <button
                onClick={() => setShowRentalPolicy(false)}
                className="p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-full transition-all"
              >
                <X className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8 space-y-10">
              {/* Overview */}
              <div>
                <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <span>🎯</span> Service Standards
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                  Our boutique rental service offers elite costume options. All rentals are subject to a security deposit and professional care standards.
                </p>
              </div>

              {/* Rental Duration */}
              <div className="p-6 bg-blue-50/50 dark:bg-blue-600/5 rounded-2xl border border-blue-100 dark:border-blue-600/10">
                <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] mb-4">Rental Duration & Return</h3>
                <ul className="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
                  <li className="flex items-start gap-2"><span>•</span> Return by 6:00 PM on the next business day after use.</li>
                  <li className="flex items-start gap-2"><span>•</span> Weekend rentals due by Monday 6:00 PM.</li>
                </ul>
              </div>

              {/* Caution Fee */}
              <div className="p-6 bg-green-50/50 dark:bg-green-600/5 rounded-2xl border border-green-100 dark:border-green-600/10">
                <h3 className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-[0.2em] mb-4">Refundable Caution Fee</h3>
                <ul className="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
                  <li className="flex items-start gap-2"><span>•</span> 50% security deposit required for all rentals.</li>
                  <li className="flex items-start gap-2"><span>•</span> Fully refunded upon safe return within 48 hours.</li>
                </ul>
              </div>

              {/* Late Return Charges */}
              <div className="p-6 bg-orange-50/50 dark:bg-orange-600/5 rounded-2xl border border-orange-100 dark:border-orange-600/10">
                <h3 className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-[0.2em] mb-4">Late Return Protocol</h3>
                <ul className="space-y-3 text-gray-600 dark:text-gray-400 text-sm italic">
                  <li>Full day rental charge applies for every 24 hours overdue.</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-t border-gray-100 dark:border-white/5 p-8 flex gap-4">
              <button
                onClick={() => setShowRentalPolicy(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10 transition-all border border-gray-100 dark:border-white/5"
              >
                Close
              </button>
              <button
                onClick={() => setShowRentalPolicy(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-lime-600 text-white hover:bg-lime-500 transition-all shadow-lg shadow-lime-600/20"
              >
                ✓ I Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Cart Success Toast - Using Portal to escape stacking context */}
      {addedToCart && (
        <Portal>
          <Toast
            message="Added to Cart!"
            subtitle={product.name}
            type="success"
            duration={3000}
            onClose={() => setAddedToCart(false)}
          />
        </Portal>
      )}

      {/* Cart Mode Conflict Error Toast - Using Portal to escape stacking context */}
      {cartConflict.hasConflict && (
        <Portal>
          <Toast
            message="Cannot Mix Order Types"
            subtitle={cartConflict.message}
            type="error"
            duration={4000}
            onClose={() => setCartConflict({ hasConflict: false, message: "" })}
          />
        </Portal>
      )}
    </div>
  );
}
