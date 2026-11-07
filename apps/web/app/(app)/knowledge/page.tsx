'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Doc = { id: string; title: string; status: string; chunks: number };

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', text: '' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ title: string; snippet: string; score: number }> | null>(null);

  const load = useCallback(async () => {
    try { setDocs((await api<{ documents: Doc[] }>('/api/v1/ai/knowledge')).documents); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Knowledge base</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <form className="card space-y-3 p-4" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<{ document: { chunks: number } }>('/api/v1/ai/knowledge', { method: 'POST', body: JSON.stringify(form) });
          setNotice(`Indexed ${r.document.chunks} chunk(s).`);
          setForm({ title: '', text: '' }); await load();
        } catch (err: any) { setError(err.message); }
      }}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-48"><span className="text-xs font-bold uppercase muted">Title</span>
            <input className="input mt-1" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        </div>
        <label className="block"><span className="text-xs font-bold uppercase muted">Content (embedded locally in dev; pgvector at cutover)</span>
          <textarea className="input mt-1 min-h-24" required value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
        <button className="btn btn-primary">Upload & index</button>
      </form>
      <div className="card p-4">
        <div className="flex gap-2">
          <input className="input" placeholder="Semantic search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search knowledge" />
          <button className="btn btn-ghost" onClick={async () => {
            try { setResults((await api<{ results: any[] }>(`/api/v1/ai/knowledge/search?q=${encodeURIComponent(q)}`)).results); }
            catch (e: any) { setError(e.message); }
          }}>Search</button>
        </div>
        {results && (results.length === 0
          ? <p className="muted mt-3 text-sm">No matches.</p>
          : <ul className="mt-3 space-y-2 text-sm">{results.map((r, i) => (
            <li key={i} className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <b>{r.title}</b> <span className="badge">{r.score}</span>
              <div className="muted mt-1">{r.snippet}</div>
            </li>))}</ul>)}
      </div>
      <div className="card p-0">
        {docs === null ? <p className="p-4 muted" role="status">Loading…</p> : docs.length === 0 ? (
          <p className="p-4 muted">No documents yet.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Title</th><th>Chunks</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td><td>{d.chunks}</td>
                  <td><span className={`badge ${d.status === 'ready' ? 'badge-ok' : ''}`}>{d.status}</span></td>
                  <td>{d.status === 'ready' && (
                    <button className="btn btn-ghost text-xs" onClick={async () => {
                      try { await api(`/api/v1/ai/knowledge/${d.id}/revoke`, { method: 'POST', body: '{}' }); await load(); }
                      catch (e: any) { setError(e.message); }
                    }}>Revoke</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
