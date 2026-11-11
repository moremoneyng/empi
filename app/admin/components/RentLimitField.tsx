'use client';

import { Lock, Layers } from 'lucide-react';
import { COSTUME_SHOW_RENT_LIMIT } from '@/lib/rentalLimits';

interface Props {
  value: number | string | null | undefined;
  onChange: (value: number | null) => void;
  isCostumeShow?: boolean;
  availableForRent?: boolean;
}

/**
 * "How many of this costume can a customer rent per order?"
 * Empty = no limit. Costume Show products are always fixed at 1.
 */
export function RentLimitField({ value, onChange, isCostumeShow, availableForRent = true }: Props) {
  if (!availableForRent) return null;

  if (isCostumeShow) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <div>
          <p className="text-sm font-semibold text-violet-900">Rental limit: {COSTUME_SHOW_RENT_LIMIT} per order</p>
          <p className="text-xs text-violet-700">Costume Show pieces can only be rented one at a time. This is applied automatically.</p>
        </div>
      </div>
    );
  }

  const display = value === null || value === undefined || Number(value) <= 0 ? '' : String(value);

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <label htmlFor="max-rent-quantity" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Layers className="h-4 w-4 text-gray-500" />
        Units available to rent
      </label>
      <p className="mt-0.5 text-xs text-gray-500">
        How many of this costume you own for rental. Customers can&apos;t rent more than this in one order. Leave empty for no limit.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="max-rent-quantity"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="No limit"
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const n = Math.floor(Number(raw));
            onChange(Number.isFinite(n) && n > 0 ? n : null);
          }}
          className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
        />
        {[1, 2, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
              Number(display) === n ? 'border-lime-500 bg-lime-50 text-lime-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {n}
          </button>
        ))}
        {display && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-gray-500 underline hover:text-gray-800">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
