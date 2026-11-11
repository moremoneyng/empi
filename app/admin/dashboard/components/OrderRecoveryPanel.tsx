'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, CreditCard, FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react';

interface UnrecordedInvoice {
  _id: string;
  invoiceNumber: string;
  orderNumber?: string;
  customerName?: string;
  totalAmount?: number;
  status?: string;
  invoiceDate?: string;
  createdAt?: string;
}

interface DeletedOrder {
  _id: string;
  orderNumber: string;
  firstName?: string;
  lastName?: string;
  total?: number;
  status?: string;
  paymentVerified?: boolean;
  deletedAt?: string;
}

interface UnrecordedPayment {
  reference: string;
  transactionId: number;
  amount: number;
  fee: number;
  suggestedOrderTotal: number;
  paidAt: string;
  paymentType?: string;
  customerName: string;
  email: string;
  phone: string;
  hasSavedCheckout: boolean;
  lastError?: string;
}

const naira = (n = 0) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dateTime = (d?: string) =>
  d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

/**
 * Surfaces sales that are missing from the Orders list:
 *  - manual invoices that were never recorded as orders (one click to record them)
 *  - online (Flutterwave) payments that have no order (record them as orders)
 *  - orders that were removed from the dashboard (restore any of them)
 * Nothing here deletes data; recording only adds orders and restoring only un-hides them.
 */
export function OrderRecoveryPanel({ onChanged }: { onChanged: () => void }) {
  const [invoices, setInvoices] = useState<UnrecordedInvoice[]>([]);
  const [deleted, setDeleted] = useState<DeletedOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showInvoices, setShowInvoices] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [payments, setPayments] = useState<UnrecordedPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { items: string; total: string }>>({});

  // The parent passes a new callback every render - keep the latest without re-running effects
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  // Checking Flutterwave can take a few seconds, so it loads separately from the rest
  const loadPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orders/unrecorded-payments', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not check online payments');
      setPayments(data.unrecorded || []);
      setPaymentsError(null);
      if (data.created?.length) {
        setMessage({ type: 'success', text: `✅ ${data.created.length} paid online order(s) were missing and have now been added.` });
        onChangedRef.current();
      }
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Could not check online payments');
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const recordPayment = async (p: UnrecordedPayment) => {
    const draft = drafts[p.reference] || { items: '', total: String(p.suggestedOrderTotal) };
    if (!draft.items.trim()) {
      setMessage({ type: 'error', text: 'Describe what the customer ordered (e.g. "Saffron x2 - rental, 1 day") before recording.' });
      return;
    }
    setBusy(p.reference);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/orders/unrecorded-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: p.reference, itemsDescription: draft.items, orderTotal: Number(draft.total) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to record payment');
      setMessage({ type: 'success', text: `✅ Payment from ${p.customerName || p.email} recorded as order ${data.orderNumber}.` });
      await loadPayments();
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record payment' });
    } finally {
      setBusy(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const [invRes, delRes] = await Promise.all([
        fetch('/api/admin/orders/unrecorded', { cache: 'no-store' }),
        fetch('/api/admin/orders/deleted', { cache: 'no-store' }),
      ]);
      if (invRes.ok) {
        const data = await invRes.json();
        const list: UnrecordedInvoice[] = data.invoices || [];
        setInvoices(list);
        setSelected(new Set(list.map((i) => i._id)));
      }
      if (delRes.ok) {
        const data = await delRes.json();
        setDeleted(data.orders || []);
      }
    } catch (err) {
      console.error('[OrderRecoveryPanel] Failed to load:', err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const recordSelected = async () => {
    if (selected.size === 0) return;
    setBusy('record');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/orders/unrecorded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record orders');
      const failedCount = data.failed?.length || 0;
      setMessage(
        failedCount > 0
          ? { type: 'error', text: `Recorded ${data.created} order(s); ${failedCount} could not be recorded.` }
          : { type: 'success', text: `✅ Recorded ${data.created} invoice(s) as orders.` }
      );
      await load();
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record orders' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (order: DeletedOrder) => {
    setBusy(order._id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/orders/deleted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore order');
      setMessage({ type: 'success', text: `✅ Order ${order.orderNumber} restored.` });
      await load();
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to restore order' });
    } finally {
      setBusy(null);
    }
  };

  if (invoices.length === 0 && deleted.length === 0 && payments.length === 0 && !paymentsError && !message) return null;

  const unrecordedTotal = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
  const selectedTotal = invoices.filter((i) => selected.has(i._id)).reduce((sum, i) => sum + (i.totalAmount || 0), 0);

  return (
    <div className="space-y-3">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-semibold border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {message.text}
        </div>
      )}

      {payments.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold text-gray-900">
                {payments.length} online payment{payments.length === 1 ? '' : 's'} (
                {naira(payments.reduce((sum, p) => sum + p.amount, 0))}) received with no order
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Flutterwave confirms these customers paid, but their order was never saved. Contact them to confirm what they
                ordered, then record it. Recording adds an order marked paid and emails the customer their invoice.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {payments.map((p) => {
              const draft = drafts[p.reference] || { items: '', total: String(p.suggestedOrderTotal) };
              const setDraft = (patch: Partial<{ items: string; total: string }>) =>
                setDrafts((prev) => ({ ...prev, [p.reference]: { ...draft, ...patch } }));
              return (
                <div key={p.reference} className="bg-white rounded-xl border border-red-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{p.customerName || 'Customer'}</p>
                      <p className="text-xs text-gray-600 break-all">
                        {p.email}
                        {p.phone && (
                          <>
                            {' · '}
                            <a href={`tel:${p.phone}`} className="text-blue-700 font-semibold">{p.phone}</a>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 break-all">
                        Paid {dateTime(p.paidAt)} · {p.paymentType?.replace('_', ' ') || 'online'} · Ref {p.reference}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-900">{naira(p.amount)}</p>
                      {p.fee > 0 && <p className="text-[11px] text-gray-500">incl. {naira(p.fee)} processing fee</p>}
                    </div>
                  </div>
                  {p.lastError && <p className="text-xs text-red-700">Auto-recovery note: {p.lastError}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                    <input
                      type="text"
                      value={draft.items}
                      onChange={(e) => setDraft({ items: e.target.value })}
                      placeholder='What did they order? e.g. "Saffron x2 - rental, 1 day"'
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      value={draft.total}
                      onChange={(e) => setDraft({ total: e.target.value })}
                      aria-label="Order total excluding processing fee"
                      title="Order total excluding the processing fee"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => recordPayment(p)}
                    disabled={busy !== null}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busy === p.reference && <Loader2 className="h-4 w-4 animate-spin" />}
                    Record as paid order
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {paymentsError && (
        <div className="p-3 rounded-xl text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200">
          Couldn&apos;t check Flutterwave for unrecorded online payments: {paymentsError}
        </div>
      )}

      {invoices.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-gray-900">
                  {invoices.length} manual invoice{invoices.length === 1 ? '' : 's'} ({naira(unrecordedTotal)}) not recorded as orders
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  These sales are missing from Orders, Finance and VAT reports. Recording them adds orders &mdash; invoices are not changed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInvoices((v) => !v)}
              className="flex items-center gap-1 px-3 py-2 text-sm font-bold rounded-xl bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
            >
              Review <ChevronDown className={`h-4 w-4 transition-transform ${showInvoices ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showInvoices && (
            <div className="bg-white rounded-xl border border-amber-200 divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {invoices.map((inv) => (
                <label key={inv._id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(inv._id)} onChange={() => toggle(inv._id)} />
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{inv.customerName || 'Customer'}</p>
                    <p className="text-xs text-gray-500">
                      {inv.invoiceNumber} · {shortDate(inv.invoiceDate || inv.createdAt)} ·{' '}
                      <span className={inv.status === 'paid' ? 'text-green-700 font-semibold' : 'text-gray-600'}>
                        {inv.status === 'paid' ? 'Paid → Approved' : 'Unpaid → Pending'}
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{naira(inv.totalAmount)}</span>
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={recordSelected}
            disabled={busy !== null || selected.size === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'record' && <Loader2 className="h-4 w-4 animate-spin" />}
            Record {selected.size} as order{selected.size === 1 ? '' : 's'} ({naira(selectedTotal)})
          </button>
        </div>
      )}

      {deleted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Trash2 className="h-4 w-4 text-gray-400" />
              {deleted.length} removed order{deleted.length === 1 ? '' : 's'}
              {deleted.some((o) => o.paymentVerified) && (
                <span className="text-xs font-semibold text-red-600">
                  ({deleted.filter((o) => o.paymentVerified).length} paid)
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showDeleted ? 'rotate-180' : ''}`} />
          </button>

          {showDeleted && (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {deleted.map((order) => (
                <div key={order._id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {[order.firstName, order.lastName].filter(Boolean).join(' ') || 'Customer'} · {naira(order.total)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.orderNumber} · {order.paymentVerified ? 'Paid' : 'Unpaid'} · status {order.status} · removed {shortDate(order.deletedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restore(order)}
                    disabled={busy !== null}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-lime-600 hover:bg-lime-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {busy === order._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
