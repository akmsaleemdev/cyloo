'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Lead = { id: string; name: string; email?: string; score: number; status: string; attribution: Record<string, string> };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', utm_source: '' });

  const load = useCallback(async () => {
    try { setLeads((await api<{ leads: Lead[] }>('/api/v1/leads')).leads); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Leads</h1>
      {error && <div className="card p-4" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/api/v1/leads', {
            method: 'POST',
            body: JSON.stringify({
              name: form.name, email: form.email || undefined,
              source_key: 'website',
              attribution: form.utm_source ? { utm_source: form.utm_source } : {},
            }),
          });
          setForm({ name: '', email: '', utm_source: '' });
          await load();
        } catch (err: any) { setError(err.message); }
      }}>
        <label className="block flex-1 min-w-36"><span className="text-xs font-bold uppercase muted">Name</span>
          <input className="input mt-1" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block flex-1 min-w-36"><span className="text-xs font-bold uppercase muted">Email</span>
          <input className="input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="block flex-1 min-w-36"><span className="text-xs font-bold uppercase muted">UTM source</span>
          <input className="input mt-1" placeholder="google" value={form.utm_source} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} /></label>
        <button className="btn btn-primary">Capture lead</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {leads === null ? <p className="p-6 muted" role="status">Loading…</p> : leads.length === 0 ? (
          <p className="p-6 muted">No leads captured yet.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Score</th><th>Status</th><th>UTM</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td><td className="muted">{l.email ?? '—'}</td>
                  <td><span className="badge">{l.score}</span></td>
                  <td><span className={`badge ${l.status === 'converted' ? 'badge-ok' : ''}`}>{l.status}</span></td>
                  <td className="muted text-xs">{l.attribution?.utm_source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
