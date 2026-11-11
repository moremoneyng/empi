'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { SERIES, SERIES_ORDER, bucketLabel, naira, nairaCompact, type SeriesKey } from './format';

interface Point { date: string; sales: number; rentals: number; custom: number; orders: number }

interface Props {
  data: Point[];
  granularity: 'day' | 'month';
  rangeLabel: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  label?: string;
  granularity: 'day' | 'month';
}

function ChartTooltip({ active, payload, label, granularity }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Point;
  const total = row.sales + row.rentals + row.custom;
  return (
    <div className="min-w-[200px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg shadow-gray-900/5">
      <p className="text-xs font-semibold text-gray-500">{bucketLabel(label || row.date, granularity, true)}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{naira(total)}</p>
      <div className="mt-2 space-y-1.5">
        {SERIES_ORDER.map((k) => (
          <div key={k} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[k].color }} />
              {SERIES[k].label}
            </span>
            <span className="font-semibold tabular-nums text-gray-900">{naira(row[k])}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        {row.orders} paid order{row.orders === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function RevenueChart({ data, granularity, rangeLabel }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const activeSeries = useMemo(
    () => SERIES_ORDER.filter((k) => data.some((d) => d[k] > 0)),
    [data]
  );
  const visibleSeries: SeriesKey[] = activeSeries.length ? activeSeries : ['sales', 'rentals'];
  const hasData = data.some((d) => d.sales + d.rentals + d.custom > 0);
  const tickInterval = data.length > 16 ? Math.ceil(data.length / 8) - 1 : 0;

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6" aria-labelledby="revenue-chart-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-chart-title" className="text-sm font-semibold text-gray-900">Revenue over time</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Paid orders, ex-VAT · {rangeLabel} · by {granularity === 'month' ? 'month' : 'day'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
            {visibleSeries.map((k) => (
              <li key={k} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[k].color }} />
                {SERIES[k].label}
              </li>
            ))}
          </ul>
          <div className="flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Chart view">
            <button
              type="button"
              onClick={() => setView('chart')}
              aria-pressed={view === 'chart'}
              className={`rounded-md p-1.5 transition ${view === 'chart' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
              title="Chart view"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              className={`rounded-md p-1.5 transition ${view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
              title="Table view"
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {view === 'chart' ? (
        <div className="mt-5 h-[280px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={data.length > 40 ? '12%' : '24%'}>
                <CartesianGrid vertical={false} stroke="#eef0f2" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => bucketLabel(v, granularity)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval={tickInterval}
                  minTickGap={8}
                />
                <YAxis
                  tickFormatter={(v) => nairaCompact(v)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(17,24,39,0.04)' }}
                  content={<ChartTooltip granularity={granularity} />}
                />
                {visibleSeries.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="rev"
                    fill={SERIES[k].color}
                    stroke="#ffffff"
                    strokeWidth={1}
                    radius={i === visibleSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={40}
                    name={SERIES[k].label}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 text-center">
              <BarChart3 className="h-6 w-6 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-600">No paid orders in this period</p>
              <p className="text-xs text-gray-400">Try a longer date range.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 max-h-[280px] overflow-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{granularity === 'month' ? 'Month' : 'Day'}</th>
                {SERIES_ORDER.map((k) => <th key={k} className="px-3 py-2 text-right font-semibold">{SERIES[k].label}</th>)}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-right font-semibold">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...data].reverse().map((row) => (
                <tr key={row.date} className="tabular-nums">
                  <td className="px-3 py-2 text-gray-700">{bucketLabel(row.date, granularity, true)}</td>
                  {SERIES_ORDER.map((k) => <td key={k} className="px-3 py-2 text-right text-gray-700">{naira(row[k])}</td>)}
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{naira(row.sales + row.rentals + row.custom)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{row.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
