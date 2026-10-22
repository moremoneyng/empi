"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Sparkles, ShoppingBag, CheckCircle2, Tag } from "lucide-react";

interface DiscountPopupProps {
  intervalMinutes?: number;
}

export function DiscountPopup({ intervalMinutes = 7 }: DiscountPopupProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has already dismissed this bulk discount announcement
    const hasSeenDiscount = localStorage.getItem("empi_has_seen_bulk_discount");
    if (!hasSeenDiscount) {
      // Delay slightly for smooth page render entry
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("empi_has_seen_bulk_discount", "true");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Dimmed Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity"
        onClick={handleClose}
      />

      {/* Popup Card */}
      <div className="relative bg-slate-900 text-white rounded-3xl shadow-2xl border border-white/10 max-w-md w-full overflow-hidden z-10 animate-in zoom-in-95 duration-300 flex flex-col">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-2 bg-slate-950/60 hover:bg-slate-950/90 text-slate-300 hover:text-white rounded-full transition-all border border-white/10 z-20"
          aria-label="Close discount popup"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero Product Image Section */}
        <div className="relative w-full h-56 bg-slate-950 overflow-hidden">
          <Image
            src="/empiimages/IMG_0793.JPG"
            alt="EMPI Costume Collection Discount"
            fill
            className="object-cover object-top hover:scale-105 transition-transform duration-700"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />

          {/* Floating Discount Badge */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-lime-500/30 text-lime-400 font-bold text-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bulk Discounts</span>
          </div>

          {/* Large Discount Banner Badge */}
          <div className="absolute bottom-3 left-6 right-6 flex items-center justify-between">
            <div className="bg-lime-500 text-slate-950 px-4 py-2 rounded-2xl font-black text-2xl font-outfit shadow-lg shadow-lime-500/30 flex items-center gap-2">
              <Tag className="w-6 h-6" />
              <span>UP TO 10% OFF</span>
            </div>
            <span className="text-xs font-semibold text-lime-300 bg-slate-950/80 px-3 py-1 rounded-full border border-lime-500/20">
              Applied at Checkout
            </span>
          </div>
        </div>

        {/* Body Content */}
        <div className="px-6 pt-4 pb-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black font-playfair text-white leading-tight mb-1 flex items-center gap-2">
              Buy More, Save More! 🎁
            </h2>
            <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
              Welcome to EMPI Costumes! Buy <strong className="text-lime-400 font-bold">3 or more costumes</strong> in one order and get a discount on purchased items (excludes rentals).
            </p>
          </div>

          {/* Offer Highlights */}
          <div className="space-y-2 bg-slate-950/50 p-3.5 rounded-2xl border border-white/5 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
              <span>3-5 costumes: 5% off</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
              <span>6-9 costumes: 7% off</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
              <span>10+ costumes: 10% off</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Link
              href="/shop"
              onClick={handleClose}
              className="flex-1 bg-lime-500 hover:bg-lime-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs md:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-lime-500/20 transition-all active:scale-95 text-center"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Shop Collection Now</span>
            </Link>
            <button
              onClick={handleClose}
              className="px-4 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl text-xs transition-colors border border-white/10"
            >
              Got It 👍
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
