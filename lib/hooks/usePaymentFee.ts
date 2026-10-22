'use client';

import { useEffect, useState } from 'react';
import { estimateFlutterwaveFee, grossUpProcessingFee } from '@/lib/paymentFees';

/**
 * Flutterwave processing fee the customer pays on top of `orderTotal` (0 when `enabled` is false).
 * `loading` is true until the fee for the current total is known.
 */
export function usePaymentFee(orderTotal: number, enabled: boolean): { fee: number; loading: boolean } {
  const [quote, setQuote] = useState<{ orderTotal: number; fee: number } | null>(null);

  useEffect(() => {
    if (!enabled || !(orderTotal > 0)) return;
    let cancelled = false;
    // Debounce so quantity changes don't fire a request each
    const timer = setTimeout(async () => {
      let fee: number;
      try {
        const res = await fetch(`/api/payment-fee?amount=${orderTotal}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || typeof data.fee !== 'number') throw new Error(data.error || 'Fee lookup failed');
        fee = data.fee;
      } catch (err) {
        console.error('Failed to fetch payment fee, using estimate:', err);
        fee = await grossUpProcessingFee(orderTotal, estimateFlutterwaveFee);
      }
      if (!cancelled) setQuote({ orderTotal, fee });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderTotal, enabled]);

  if (!enabled || !(orderTotal > 0)) return { fee: 0, loading: false };
  if (!quote || quote.orderTotal !== orderTotal) return { fee: 0, loading: true };
  return { fee: quote.fee, loading: false };
}
