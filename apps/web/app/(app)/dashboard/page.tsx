'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<{ contacts: number; deals: number; forecast: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, p, f] = await Promise.all([
          api<{ total: number }>('/api/v1/contacts?limit=1'),
          api<{ pipelines: any[] }>('/api/v1/pipelines'),
          api<{ weighted_amount_minor: number }>('/api/v1/forecast'),
        ]);
        setStats({
          contacts: c.total,
          deals: p.pipelines.reduce((a: number, x: any) => a + x.stages.length, 0),
          forecast: f.weighted_amount_minor.toLocaleString(),
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">Dashboard</h1>
      {loading && <div className="card p-6 muted" role="status">Loading…</div>}
      {error && <div className="card p-6" style={{ color: 'var(--danger)' }} role="alert">{error} — is the API on :3001?</div>}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5"><div className="text-xs font-bold uppercase muted">Contacts</div><div className="mt-1 text-2xl font-extrabold">{stats.contacts}</div></div>
          <div className="card p-5"><div className="text-xs font-bold uppercase muted">Pipeline stages</div><div className="mt-1 text-2xl font-extrabold">{stats.deals}</div></div>
          <div className="card p-5"><div className="text-xs font-bold uppercase muted">Weighted forecast (AED)</div><div className="mt-1 text-2xl font-extrabold">{stats.forecast}</div></div>
        </div>
      )}
    </div>
  );
}
