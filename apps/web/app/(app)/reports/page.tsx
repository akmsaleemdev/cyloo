'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function ReportsPage() {
  const [data, setData] = useState<{ funnel: any; perf: any; campaigns: any; times: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [funnel, perf, campaigns, times] = await Promise.all([
          api<any>('/api/v1/analytics/funnel'),
          api<any>('/api/v1/analytics/sales-performance'),
          api<any>('/api/v1/analytics/campaigns'),
          api<any>('/api/v1/analytics/response-times'),
        ]);
        setData({ funnel, perf, campaigns, times });
      } catch (e: any) { setError(e.message); }
    })();
  }, []);

  if (error) return <div className="card p-4" style={{ color: 'var(--danger)' }} role="alert">{error}</div>;
  if (!data) return <div className="card p-6 muted" role="status">Loading reports…</div>;
  const f = data.funnel;
  const max = Math.max(1, f.leads_total, f.opportunities, f.won);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Reports</h1>
      <div className="card p-4">
        <b className="text-sm">Funnel (recorded data only — never estimated)</b>
        <div className="mt-3 space-y-2">
          {[['Leads', f.leads_total], ['MQL', f.mql], ['SQL', f.sql], ['Opportunities', f.opportunities], ['Won', f.won]].map(([label, v]) => (
            <div key={String(label)} className="flex items-center gap-3 text-sm">
              <span className="w-28 muted">{label}</span>
              <div className="h-4 rounded-full" style={{ width: `${(Number(v) / max) * 60}%`, minWidth: 6, background: 'var(--primary)' }} />
              <b>{v}</b>
            </div>
          ))}
        </div>
        <p className="muted mt-2 text-xs">Won amount: AED {((f.won_amount_minor ?? 0) / 100).toLocaleString()}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <b className="text-sm">Sales performance (per owner)</b>
          <table className="data mt-2"><thead><tr><th>Owner</th><th>Won</th><th>Amount</th></tr></thead>
            <tbody>{(data.perf.performance ?? []).map((p: any) => (
              <tr key={p.owner_id}><td className="text-xs">{p.owner_id.slice(0, 8)}…</td><td>{p.won}</td><td>{(p.amount / 100).toLocaleString()}</td></tr>
            ))}</tbody></table>
        </div>
        <div className="card p-4">
          <b className="text-sm">Campaign metrics</b>
          <table className="data mt-2"><thead><tr><th>Campaign</th><th>Sends</th><th>Metrics</th></tr></thead>
            <tbody>{(data.campaigns.campaigns ?? []).map((c: any) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.sends}</td><td className="text-xs">{c.metrics ? Object.entries(c.metrics).map(([k, v]) => `${k}:${v}`).join(' ') : '—'}</td></tr>
            ))}</tbody></table>
          <p className="muted mt-2 text-xs">Avg first response: {data.times.avg_first_response_minutes ?? '—'} min over {data.times.conversations_measured} conversation(s)</p>
        </div>
      </div>
    </div>
  );
}
