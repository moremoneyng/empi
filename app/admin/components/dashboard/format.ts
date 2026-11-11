export const SERIES = {
  sales: { label: 'Sales', color: '#2a78d6' },
  rentals: { label: 'Rentals', color: '#eb6834' },
  custom: { label: 'Custom orders', color: '#1baf7a' },
} as const;

export type SeriesKey = keyof typeof SERIES;
export const SERIES_ORDER: SeriesKey[] = ['sales', 'rentals', 'custom'];

export function naira(value: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n).toLocaleString('en-NG', {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
  return `${n < 0 ? '−' : ''}₦${abs}`;
}

export function nairaCompact(value: number) {
  const n = Math.abs(Number(value) || 0);
  const sign = value < 0 ? '−' : '';
  if (n >= 1_000_000_000) return `${sign}₦${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${sign}₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${sign}₦${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${sign}₦${n.toFixed(0)}`;
}

/** Percentage change vs. the previous period, or null when there is nothing to compare */
export function delta(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function bucketLabel(key: string, granularity: 'day' | 'month', long = false) {
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(long && { weekday: 'short', year: 'numeric' }), timeZone: 'UTC' });
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const STATUS_META: Record<string, { label: string; className: string }> = {
  awaiting: { label: 'Awaiting payment', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  pending: { label: 'Paid · to approve', className: 'bg-sky-50 text-sky-800 ring-sky-600/20' },
  approved: { label: 'Approved', className: 'bg-indigo-50 text-indigo-800 ring-indigo-600/20' },
  in_production: { label: 'In production', className: 'bg-violet-50 text-violet-800 ring-violet-600/20' },
  ready_for_delivery: { label: 'Ready', className: 'bg-teal-50 text-teal-800 ring-teal-600/20' },
  delivered: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
  refunded: { label: 'Refunded', className: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
};

export function orderStatusMeta(status: string, paid: boolean, channel: string) {
  if (channel === 'offline') {
    return status === 'pending' ? STATUS_META.awaiting : STATUS_META[status] || STATUS_META.completed;
  }
  if (status === 'pending') return paid ? STATUS_META.pending : STATUS_META.awaiting;
  return STATUS_META[status] || { label: status.replace(/_/g, ' '), className: 'bg-gray-100 text-gray-700 ring-gray-500/20' };
}

export const CHANNEL_LABEL: Record<string, string> = {
  online: 'Website',
  manual_invoice: 'Invoice',
  offline: 'Walk-in',
};

export const KIND_LABEL: Record<string, string> = {
  sale: 'Sale',
  rental: 'Rental',
  mixed: 'Sale + rental',
  custom: 'Custom',
};
