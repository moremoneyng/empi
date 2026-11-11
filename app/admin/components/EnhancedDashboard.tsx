'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Factory,
  Info,
  Package,
  PackageCheck,
  RefreshCw,
  Repeat,
  Sparkles,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAdmin } from '@/app/context/AdminContext';
import { RevenueChart } from './dashboard/RevenueChart';
import {
  CHANNEL_LABEL,
  KIND_LABEL,
  SERIES,
  SERIES_ORDER,
  delta,
  naira,
  orderStatusMeta,
  relativeTime,
} from './dashboard/format';

/* ───────────────────────────── Types (mirror lib/analytics/storeMetrics.ts) ───────────────────────────── */

type RangeKey = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | '12m' | 'all';

interface Financials {
  orders: number;
  rentalOrders: number;
  salesOrders: number;
  customOrders: number;
  revenue: number;
  sales: number;
  rentals: number;
  custom: number;
  grossCollected: number;
  outputVAT: number;
  inputVAT: number;
  vatPayable: number;
  cautionCollected: number;
  operatingExpenses: number;
  expenseCount: number;
  payrollPaid: number;
  payrollCount: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
  averageOrderValue: number;
}

interface Analytics {
  generatedAt: string;
  range: { key: RangeKey; label: string; granularity: 'day' | 'month'; from: string; to: string };
  kpis: Financials & { previous: Financials | null };
  series: Array<{ date: string; sales: number; rentals: number; custom: number; orders: number }>;
  channels: Array<{ key: string; label: string; orders: number; revenue: number; sales: number; rentals: number; custom: number }>;
  topProducts: Array<{ key: string; name: string; image?: string; revenue: number; soldUnits: number; rentedUnits: number }>;
  operations: {
    awaitingPayment: { count: number; amount: number };
    toApprove: { count: number; amount: number };
    inProduction: { count: number };
    readyForDelivery: { count: number };
    deliveredInRange: { count: number };
    rentalEvents: Array<{ id: string; orderNumber: string; customer: string; type: 'pickup' | 'return'; date: string; time?: string; location?: string }>;
  };
  recentOrders: Array<{ id: string; orderNumber: string; customer: string; total: number; status: string; paid: boolean; counted: boolean; channel: string; kind: string; createdAt: string }>;
  customers: { registered: number; newInRange: number; payingInRange: number; payingAllTime: number; repeatCustomers: number };
  catalog: { products: number; rentable: number; costumeShow: number; rentLimited: number };
}

const RANGES: Array<{ key: RangeKey; short: string; long: string }> = [
  { key: '7d', short: '7D', long: 'Last 7 days' },
  { key: '30d', short: '30D', long: 'Last 30 days' },
  { key: '90d', short: '90D', long: 'Last 90 days' },
  { key: 'mtd', short: 'MTD', long: 'This month' },
  { key: 'ytd', short: 'YTD', long: 'This year' },
  { key: '12m', short: '12M', long: 'Last 12 months' },
  { key: 'all', short: 'All', long: 'All time' },
];

const RANGE_STORAGE_KEY = 'empi_admin_dashboard_range';
const ORDERS_HREF = '/admin/dashboard?tab=pending';

/* ───────────────────────────── Small building blocks ───────────────────────────── */

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="rounded-full text-gray-400 outline-none transition hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-lime-500"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-normal leading-relaxed text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function DeltaBadge({ value, invert = false, hasPrevious }: { value: number | null; invert?: boolean; hasPrevious: boolean }) {
  if (!hasPrevious) return null;
  if (value === null) return <span className="text-[11px] font-medium text-gray-400">No prior data</span>;
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return <span className="text-[11px] font-semibold text-gray-500">0% vs prior</span>;
  const up = rounded > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(rounded).toLocaleString('en-NG', { maximumFractionDigits: 1 })}%
      <span className="ml-0.5 font-medium text-gray-400">vs prior</span>
    </span>
  );
}

function KpiCard({
  label, value, tip, footer, deltaValue, hasPrevious, invertDelta, tone = 'default', children,
}: {
  label: string;
  value: string;
  tip: string;
  footer?: React.ReactNode;
  deltaValue?: number | null;
  hasPrevious: boolean;
  invertDelta?: boolean;
  tone?: 'default' | 'negative';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200/80 bg-white p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <InfoTip text={tip} />
      </div>
      <p className={`mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${tone === 'negative' ? 'text-rose-700' : 'text-gray-900'}`}>
        {value}
      </p>
      <div className="mt-2 min-h-[18px]">
        {deltaValue !== undefined && <DeltaBadge value={deltaValue} invert={invertDelta} hasPrevious={hasPrevious} />}
      </div>
      {children && <div className="mt-4">{children}</div>}
      {footer && <div className="mt-auto pt-4 text-xs text-gray-500">{footer}</div>}
    </div>
  );
}

function MixBar({ parts }: { parts: Array<{ key: string; value: number; color: string; label: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <div className="h-2 rounded-full bg-gray-100" aria-hidden />;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-600 transition hover:text-gray-900">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function greeting(name?: string) {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }));
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = (name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

/* ───────────────────────────── Dashboard ───────────────────────────── */

export function EnhancedDashboard() {
  const { admin } = useAdmin();
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Remember the chosen range for this browser
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RANGE_STORAGE_KEY) as RangeKey | null;
      if (saved && RANGES.some((r) => r.key === saved)) setRange(saved);
    } catch { /* storage unavailable */ }
  }, []);

  const load = useCallback(async (key: RangeKey, mode: 'initial' | 'manual' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'manual') setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/analytics?range=${key}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      if (id !== requestId.current) return;
      setData(body);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      if (mode !== 'silent') setError(err instanceof Error ? err.message : 'Could not load the dashboard');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(range, data ? 'manual' : 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, load]);

  // Quiet refresh every minute while the tab is visible
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(range, 'silent');
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [range, load]);

  const chooseRange = (key: RangeKey) => {
    setRange(key);
    try { localStorage.setItem(RANGE_STORAGE_KEY, key); } catch { /* ignore */ }
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
          <h3 className="mt-3 text-base font-semibold text-gray-900">The dashboard didn&apos;t load</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => { setLoading(true); load(range, 'initial'); }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const k = data.kpis;
  const p = k.previous;
  const hasPrev = Boolean(p);
  const ops = data.operations;
  const revenueParts = SERIES_ORDER.map((key) => ({ key, value: k[key], color: SERIES[key].color, label: SERIES[key].label }));
  const attention = [
    { key: 'awaiting', count: ops.awaitingPayment.count, label: 'Awaiting payment', detail: `${naira(ops.awaitingPayment.amount)} to confirm`, icon: CreditCard, href: ORDERS_HREF, tone: 'amber' },
    { key: 'approve', count: ops.toApprove.count, label: 'Paid · to approve', detail: `${naira(ops.toApprove.amount)} received`, icon: CheckCircle2, href: ORDERS_HREF, tone: 'sky' },
    { key: 'production', count: ops.inProduction.count, label: 'In production', detail: 'Approved, being prepared', icon: Factory, href: ORDERS_HREF, tone: 'violet' },
    { key: 'ready', count: ops.readyForDelivery.count, label: 'Ready to hand over', detail: 'Delivery or pickup', icon: Truck, href: '/admin/logistics', tone: 'teal' },
  ];
  const toneClass: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
    teal: 'bg-teal-50 text-teal-700',
  };
  const maxChannel = Math.max(1, ...data.channels.map((c) => c.revenue));
  const maxTop = Math.max(1, ...data.topProducts.map((t) => t.revenue));

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      {/* ── Header ── */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-[28px]">{greeting(admin?.fullName)}</h1>
          <p className="mt-1 text-sm text-gray-500">Here&apos;s how EMPI is performing — <span className="font-medium text-gray-700">{data.range.label.toLowerCase()}</span>.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white p-1" role="tablist" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                title={r.long}
                onClick={() => chooseRange(r.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  range === r.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {r.short}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(range, 'manual')}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            title="Refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Updated {relativeTime(data.generatedAt)}</span>
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t refresh: {error}. Showing the last loaded figures.
        </div>
      )}

      {/* ── Needs attention ── */}
      <section aria-label="Needs attention" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {attention.map((a) => {
          const Icon = a.icon;
          const idle = a.count === 0;
          return (
            <Link
              key={a.key}
              href={a.href}
              className={`group flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:border-gray-300 hover:shadow-sm ${idle ? 'border-gray-200/80' : 'border-gray-200'}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${idle ? 'bg-gray-50 text-gray-400' : toneClass[a.tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`text-xl font-semibold tabular-nums ${idle ? 'text-gray-400' : 'text-gray-900'}`}>{a.count}</span>
                  <span className="truncate text-xs font-medium text-gray-700">{a.label}</span>
                </span>
                <span className="block truncate text-[11px] text-gray-500">{idle ? 'Nothing waiting' : a.detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-600" />
            </Link>
          );
        })}
      </section>

      {/* ── KPIs ── */}
      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={naira(k.revenue)}
          tip="Money earned from paid orders in this period, excluding VAT and refundable caution deposits. Unpaid and cancelled orders are not counted."
          deltaValue={delta(k.revenue, p?.revenue)}
          hasPrevious={hasPrev}
          footer={<span>{k.orders} paid order{k.orders === 1 ? '' : 's'} · avg {naira(k.averageOrderValue)}</span>}
        >
          <MixBar parts={revenueParts} />
          <ul className="mt-2.5 space-y-1">
            {revenueParts.map((part) => (
              <li key={part.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <span className="h-2 w-2 rounded-sm" style={{ background: part.color }} />{part.label}
                </span>
                <span className="font-medium tabular-nums text-gray-900">{naira(part.value)}</span>
              </li>
            ))}
          </ul>
        </KpiCard>

        <KpiCard
          label="Net profit"
          value={naira(k.netProfit)}
          tone={k.netProfit < 0 ? 'negative' : 'default'}
          tip="Revenue minus operating expenses and payroll paid in this period. VAT is not deducted again because revenue is already ex-VAT."
          deltaValue={delta(k.netProfit, p?.netProfit)}
          hasPrevious={hasPrev}
          footer={
            <span>
              {k.revenue > 0 ? <><span className="font-semibold text-gray-700">{k.margin.toFixed(1)}%</span> margin</> : 'No revenue in this period yet'}
            </span>
          }
        >
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-gray-500">Revenue</dt><dd className="tabular-nums text-gray-900">{naira(k.revenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">− Expenses &amp; payroll</dt><dd className="tabular-nums text-gray-900">{naira(k.totalExpenses)}</dd></div>
          </dl>
        </KpiCard>

        <KpiCard
          label="Expenses"
          value={naira(k.totalExpenses)}
          tip="Operating expenses recorded in Finance (ex-VAT) plus payroll marked as paid in this period."
          deltaValue={delta(k.totalExpenses, p?.totalExpenses)}
          invertDelta
          hasPrevious={hasPrev}
          footer={<Link href="/admin/finance" className="font-semibold text-gray-600 hover:text-gray-900">Open Finance →</Link>}
        >
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-gray-500">Operating ({k.expenseCount})</dt><dd className="tabular-nums text-gray-900">{naira(k.operatingExpenses)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Payroll ({k.payrollCount})</dt><dd className="tabular-nums text-gray-900">{naira(k.payrollPaid)}</dd></div>
          </dl>
        </KpiCard>

        <KpiCard
          label="VAT payable"
          value={naira(k.vatPayable, { decimals: true })}
          tip="Output VAT charged on paid orders in this period minus input VAT on recorded expenses. VAT is never charged on delivery fees or caution deposits."
          hasPrevious={hasPrev}
          footer={<Link href="/admin/finance" className="font-semibold text-gray-600 hover:text-gray-900">VAT details →</Link>}
        >
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-gray-500">Output VAT (sales)</dt><dd className="tabular-nums text-gray-900">{naira(k.outputVAT, { decimals: true })}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">− Input VAT (expenses)</dt><dd className="tabular-nums text-gray-900">{naira(k.inputVAT, { decimals: true })}</dd></div>
          </dl>
        </KpiCard>
      </section>

      {/* ── Chart + channels ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart data={data.series} granularity={data.range.granularity} rangeLabel={data.range.label} />
        </div>

        <Panel title="Where revenue comes from" subtitle={`Paid orders · ${data.range.label}`}>
          <ul className="space-y-4">
            {data.channels.map((c) => (
              <li key={c.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">{c.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">{naira(c.revenue)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-gray-900" style={{ width: `${(c.revenue / maxChannel) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">{c.orders} order{c.orders === 1 ? '' : 's'}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
            <p className="font-semibold text-gray-800">Total collected: {naira(k.grossCollected)}</p>
            <p>Includes VAT {naira(k.outputVAT)} and refundable caution deposits {naira(k.cautionCollected)}, which are not revenue.</p>
          </div>
        </Panel>
      </div>

      {/* ── Recent orders + rental schedule ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Latest orders" subtitle="Most recent across website, invoices and walk-ins" action={<PanelLink href={ORDERS_HREF}>All orders</PanelLink>} className="xl:col-span-2">
          {data.recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No orders yet.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-2 sm:px-6">Order</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-5 py-2 text-right sm:px-6">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recentOrders.map((o) => {
                    const meta = orderStatusMeta(o.status, o.paid, o.channel);
                    return (
                      <tr key={`${o.channel}-${o.id}`} className="hover:bg-gray-50/70">
                        <td className="px-5 py-3 sm:px-6">
                          <Link href={ORDERS_HREF} className="block max-w-[180px] truncate font-medium text-gray-900 hover:underline" title={o.orderNumber}>{o.orderNumber}</Link>
                          <span className="text-[11px] text-gray-400">{CHANNEL_LABEL[o.channel] || o.channel} · {relativeTime(o.createdAt)}</span>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-gray-700" title={o.customer}>{o.customer}</td>
                        <td className="px-3 py-3 text-xs text-gray-600">{KIND_LABEL[o.kind] || o.kind}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.className}`}>{meta.label}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900 sm:px-6">{naira(o.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Rental schedule" subtitle="Pickups and returns in the next 7 days" action={<PanelLink href="/admin/logistics">Logistics</PanelLink>}>
          {ops.rentalEvents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CalendarClock className="h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-600">Nothing scheduled</p>
              <p className="text-xs text-gray-400">Upcoming rental pickups and returns show here.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {ops.rentalEvents.map((e) => {
                const [y, m, d] = e.date.split('-').map(Number);
                const dt = new Date(Date.UTC(y, m - 1, d));
                return (
                  <li key={`${e.type}-${e.id}`} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5">
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-gray-50 py-1">
                      <span className="text-[10px] font-semibold uppercase text-gray-500">{dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
                      <span className="text-base font-semibold leading-tight tabular-nums text-gray-900">{d}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{e.customer}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {e.orderNumber}{e.location ? ` · ${e.location === 'iba' ? 'Iba' : e.location === 'surulere' ? 'Surulere' : e.location}` : ''}{e.time ? ` · ${e.time}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${e.type === 'pickup' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 'bg-orange-50 text-orange-700 ring-orange-600/20'}`}>
                      {e.type === 'pickup' ? 'Pickup' : 'Return'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Top costumes + customers/catalog ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Top costumes" subtitle={`By revenue · ${data.range.label}`} action={<PanelLink href="/admin/dashboard?tab=products">Products</PanelLink>} className="xl:col-span-2">
          {data.topProducts.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Crown className="h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-600">No paid sales or rentals in this period</p>
            </div>
          ) : (
            <ol className="space-y-3">
              {data.topProducts.map((t, i) => (
                <li key={t.key} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400">{i + 1}</span>
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="m-2.5 h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-gray-900" title={t.name}>{t.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{naira(t.revenue)}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full" style={{ width: `${(t.revenue / maxTop) * 100}%`, background: SERIES.sales.color }} />
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-500">
                        {[t.soldUnits ? `${t.soldUnits} sold` : '', t.rentedUnits ? `${t.rentedUnits} rented` : ''].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Customers" action={<PanelLink href="/admin/dashboard?tab=users">View</PanelLink>}>
            <dl className="grid grid-cols-2 gap-3">
              {[
                { label: 'Registered accounts', value: data.customers.registered, icon: Users },
                { label: `New sign-ups`, value: data.customers.newInRange, icon: UserPlus },
                { label: 'Paying customers', value: data.customers.payingInRange, icon: Sparkles },
                { label: 'Repeat customers', value: data.customers.repeatCustomers, icon: Repeat },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="rounded-xl bg-gray-50 p-3">
                    <dt className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500"><Icon className="h-3.5 w-3.5" />{s.label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{s.value.toLocaleString()}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-[11px] text-gray-400">New sign-ups and paying customers are for {data.range.label.toLowerCase()}; the rest are all-time.</p>
          </Panel>

          <Panel title="Catalogue" action={<PanelLink href="/admin/dashboard?tab=products">Manage</PanelLink>}>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-gray-500">Products</dt><dd className="font-semibold tabular-nums text-gray-900">{data.catalog.products}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Available to rent</dt><dd className="font-semibold tabular-nums text-gray-900">{data.catalog.rentable}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Costume Show pieces <span className="text-gray-400">(1 per rental)</span></dt><dd className="font-semibold tabular-nums text-gray-900">{data.catalog.costumeShow}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">With a rental stock limit</dt><dd className="font-semibold tabular-nums text-gray-900">{data.catalog.rentLimited}</dd></div>
            </dl>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 p-2.5 text-[11px] text-gray-600">
              <PackageCheck className="h-4 w-4 shrink-0 text-gray-400" />
              Set &ldquo;Units available to rent&rdquo; on a product to stop customers renting more than you own.
            </div>
          </Panel>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        Figures use Lagos time. Revenue counts paid orders only and excludes VAT and caution deposits. {ops.deliveredInRange.count} order{ops.deliveredInRange.count === 1 ? '' : 's'} delivered in this period.
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] animate-pulse space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex items-end justify-between">
        <div className="space-y-2"><div className="h-3 w-40 rounded bg-gray-200" /><div className="h-7 w-64 rounded bg-gray-200" /></div>
        <div className="h-9 w-80 rounded-xl bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-2xl bg-gray-200/70" />)}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 rounded-2xl bg-gray-200/70" />)}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><div className="h-80 rounded-2xl bg-gray-200/70 xl:col-span-2" /><div className="h-80 rounded-2xl bg-gray-200/70" /></div>
    </div>
  );
}

export default EnhancedDashboard;
