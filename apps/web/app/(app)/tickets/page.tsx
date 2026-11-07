'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Ticket = { id: string; number: string; subject: string; status: string; priority: string; first_response_due_at?: string; escalated_at?: string };

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [sel, setSel] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Array<{ body: string; author_type: string }>>([]);
  const [reply, setReply] = useState('');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('normal');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTickets((await api<{ tickets: Ticket[] }>('/api/v1/service/tickets')).tickets); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = useCallback(async (t: Ticket) => {
    setSel(t);
    try { setComments((await api<{ comments: any[] }>(`/api/v1/service/tickets/${t.id}`)).comments); }
    catch (e: any) { setError(e.message); }
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Service desk</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<{ sla_due_at: string }>('/api/v1/service/tickets', { method: 'POST', body: JSON.stringify({ subject, priority }) });
          setNotice(`Ticket created — SLA first response due ${new Date(r.sla_due_at).toLocaleString()}`);
          setSubject(''); await load();
        } catch (err: any) { setError(err.message); }
      }}>
        <label className="block flex-1 min-w-48"><span className="text-xs font-bold uppercase muted">Subject</span>
          <input className="input mt-1" required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="block"><span className="text-xs font-bold uppercase muted">Priority</span>
          <select className="input mt-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}
          </select></label>
        <button className="btn btn-primary">Create ticket</button>
        <button type="button" className="btn btn-ghost text-xs" onClick={async () => {
          try { const r = await api<{ breached: number; escalated_now: number }>('/api/v1/service/sla/sweep', { method: 'POST', body: '{}' }); setNotice(`SLA sweep: ${r.breached} breached, ${r.escalated_now} escalated now.`); await load(); }
          catch (e: any) { setError(e.message); }
        }}>Run SLA sweep</button>
      </form>
      <div className="card p-0">
        {tickets === null ? <p className="p-4 muted" role="status">Loading…</p> : tickets.length === 0 ? <p className="p-4 muted">No tickets yet.</p> : (
          <table className="data">
            <thead><tr><th>Number</th><th>Subject</th><th>Priority</th><th>Status</th><th>SLA</th><th></th></tr></thead>
            <tbody>{tickets.map((t) => (
              <tr key={t.id}>
                <td><button className="focusable" onClick={() => open(t)}><b>{t.number}</b></button></td>
                <td>{t.subject}</td><td><span className="badge">{t.priority}</span></td>
                <td><span className={`badge ${t.status === 'resolved' ? 'badge-ok' : ''}`}>{t.status}</span></td>
                <td className="text-xs">{t.escalated_at ? <span className="badge badge-warn">escalated</span> : (t.first_response_due_at ? new Date(t.first_response_due_at).toLocaleString() : '—')}</td>
                <td className="space-x-1">
                  {t.status !== 'resolved'
                    ? <button className="btn btn-ghost text-xs" onClick={async () => { try { await api(`/api/v1/service/tickets/${t.id}/resolve`, { method: 'POST', body: '{}' }); await load(); } catch (e: any) { setError(e.message); } }}>Resolve</button>
                    : <button className="btn btn-ghost text-xs" onClick={async () => { try { await api(`/api/v1/service/tickets/${t.id}/reopen`, { method: 'POST', body: '{}' }); await load(); } catch (e: any) { setError(e.message); } }}>Reopen</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {sel && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2"><b>{sel.number} — {sel.subject}</b><span className="badge">{sel.status}</span></div>
          <div className="space-y-2">
            {comments.map((c, i) => <div key={i} className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface-2)' }}>{c.body}</div>)}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await api(`/api/v1/service/tickets/${sel.id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply }) }); setReply(''); await open(sel); }
            catch (e: any) { setError(e.message); }
          }}>
            <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" />
            <button className="btn btn-primary">Reply</button>
          </form>
        </div>
      )}
    </div>
  );
}
