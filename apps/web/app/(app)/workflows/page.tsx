'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Run = { id: string; status: string; workflow_version: number; started_at: string; idempotency_key?: string; steps: Array<{ node_id: string; kind: string; status: string; attempt?: number; error?: string }> };

export default function WorkflowsPage() {
  const [wfs, setWfs] = useState<Array<{ id: string; name: string; trigger_event: string; version: number; active: boolean; runs: number }> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', trigger: 'contact.created', title: 'Follow up the new contact' });

  const load = useCallback(async () => {
    try {
      setWfs((await api<{ workflows: any[] }>('/api/v1/workflows')).workflows);
      setRuns((await api<{ runs: Run[] }>('/api/v1/workflows/runs')).runs);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Workflows</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api('/api/v1/workflows', {
            method: 'POST',
            body: JSON.stringify({
              name: form.name,
              definition: {
                trigger: form.trigger,
                steps: [
                  { id: 'notify', type: 'notify_user', config: {} },
                  { id: 'task', type: 'create_task', config: { title: form.title } },
                ],
              },
            }),
          });
          setNotice('Workflow created (v1). Dry-run available via API.');
          await load();
        } catch (err: any) { setError(err.message); }
      }}>
        <label className="block"><span className="text-xs font-bold uppercase muted">Name</span>
          <input className="input mt-1" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="text-xs font-bold uppercase muted">Trigger</span>
          <select className="input mt-1" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
            <option>contact.created</option><option>lead.created</option><option>opportunity.won</option>
          </select></label>
        <label className="block flex-1 min-w-48"><span className="text-xs font-bold uppercase muted">Task title action</span>
          <input className="input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <button className="btn btn-primary">Create workflow</button>
      </form>
      <div className="card p-0">
        {wfs === null ? <p className="p-4 muted" role="status">Loading…</p> : wfs.length === 0 ? <p className="p-4 muted">No workflows yet.</p> : (
          <table className="data">
            <thead><tr><th>Name</th><th>Trigger</th><th>Version</th><th>Runs</th><th>State</th></tr></thead>
            <tbody>{wfs.map((w) => (
              <tr key={w.id}><td>{w.name}</td><td><code className="text-xs">{w.trigger_event}</code></td>
                <td>v{w.version}</td><td>{w.runs}</td>
                <td><span className={`badge ${w.active ? 'badge-ok' : ''}`}>{w.active ? 'active' : 'off'}</span></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="card p-0">
        <div className="border-b p-3 text-sm font-bold" style={{ borderColor: 'var(--border)' }}>Recent runs (steps auditable)</div>
        {runs.length === 0 ? <p className="p-4 muted">No runs yet — they fire on domain events (create a contact or lead).</p> : (
          <table className="data">
            <thead><tr><th>Started</th><th>Status</th><th>Version</th><th>Steps</th></tr></thead>
            <tbody>{runs.slice(0, 15).map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{r.started_at.slice(0, 19).replace('T', ' ')}</td>
                <td><span className={`badge ${r.status === 'completed' ? 'badge-ok' : r.status === 'failed' ? 'badge-warn' : ''}`}>{r.status}</span></td>
                <td>v{r.workflow_version}</td>
                <td className="text-xs">{r.steps.map((s) => `${s.node_id}:${s.status}${s.attempt && s.attempt > 1 ? `(x${s.attempt})` : ''}`).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
