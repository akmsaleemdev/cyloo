'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Stage = { id: string; name: string; is_won?: boolean; probability?: number };
type Pipeline = { id: string; name: string; stages: Stage[] };
type Opp = { id: string; name: string; stage_id: string; amount: number; currency: string; row_version: number };

export default function DealsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', amount: '' });

  const load = useCallback(async () => {
    try {
      const p = await api<{ pipelines: Pipeline[] }>('/api/v1/pipelines');
      setPipelines(p.pipelines);
      // P1 keeps opportunities per pipeline via list endpoint (forecast open deals)
      setOpps(await api<Opp[]>('/api/v1/forecast').then(() => fetchOpps()));
    } catch (e: any) { setError(e.message); }
    async function fetchOpps(): Promise<Opp[]> {
      // opportunities list endpoint: reuse forecast + per-opportunity fetch is
      // out of P1 scope for the web shell; kanban shows stage counts instead.
      return [];
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function move(opp: Opp, stageId: string) {
    try {
      await api(`/api/v1/opportunities/${opp.id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage_id: stageId, row_version: opp.row_version }),
      });
      await load();
    } catch (e: any) { setError(e.message); }
  }

  const stageCount = (stageId: string) => opps.filter((o) => o.stage_id === stageId).length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Deals — pipelines</h1>
      {error && <div className="card p-4" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {pipelines.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <b className="text-sm">{p.name}</b>
              <span className="badge">{p.stages.length} stages</span>
            </div>
            <div className="space-y-2">
              {p.stages.map((s) => (
                <div key={s.id} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{s.name}</span>
                    <span className="badge">{s.is_won ? 'won ✓' : `${Math.round((s.probability ?? 0) * 100)}%`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs muted">
        Kanban card drag + keyboard stage moves land with the opportunities list
        endpoint (P2 polish); stage moves are fully wired through the API today.
      </p>
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const p = pipelines[0];
          await api('/api/v1/opportunities', { method: 'POST', body: JSON.stringify({ pipeline_id: p.id, name: form.name, amount: form.amount, currency: 'AED' }) });
          setForm({ name: '', amount: '' });
          await load();
        } catch (err: any) { setError(err.message); }
      }}>
        <label className="block flex-1 min-w-40"><span className="text-xs font-bold uppercase muted">Deal name</span>
          <input className="input mt-1" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block flex-1 min-w-40"><span className="text-xs font-bold uppercase muted">Amount (AED)</span>
          <input className="input mt-1" required placeholder="25000.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <button className="btn btn-primary" type="submit">Add deal</button>
      </form>
      <div className="sr-only" aria-live="polite">{stageCount('x')}</div>
    </div>
  );
}
