'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';

type Conv = { id: string; external_ref: string; status: string; mode: string; unread_count: number; channel_kind?: string; last_message?: { body: string; direction: string; status: string } | null };
type Msg = { id: string; direction: 'in' | 'out'; body: string; status: string; created_at: string };

export default function InboxPage() {
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [sel, setSel] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try { setConvs((await api<{ conversations: Conv[] }>('/api/v1/conversations')).conversations); }
    catch (e: any) { setError(e.message); }
  }, []);

  const openConv = useCallback(async (c: Conv) => {
    setSel(c);
    try {
      const res = await api<{ messages: Msg[] }>(`/api/v1/conversations/${c.id}/messages`);
      setMsgs(res.messages);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { loadConvs(); const t = setInterval(loadConvs, 8000); return () => clearInterval(t); }, [loadConvs]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);

  async function sendReply() {
    if (!sel || !reply.trim()) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/v1/conversations/${sel.id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply }) });
      setReply('');
      await openConv(sel); await loadConvs();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function setMode(mode: 'ai' | 'human') {
    if (!sel) return;
    try { await api(`/api/v1/conversations/${sel.id}/mode`, { method: 'POST', body: JSON.stringify({ mode }) }); await loadConvs(); setSel({ ...sel, mode }); }
    catch (e: any) { setError(e.message); }
  }
  async function closeConv() {
    if (!sel) return;
    try { await api(`/api/v1/conversations/${sel.id}/close`, { method: 'POST', body: '{}' }); await loadConvs(); setSel({ ...sel, status: 'closed', mode: 'off' }); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">Inbox</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="card p-0 overflow-hidden" role="list" aria-label="Conversations">
          {convs === null ? <p className="p-4 muted" role="status">Loading…</p>
            : convs.length === 0 ? <p className="p-4 muted">No conversations yet. Configure a channel and send a webhook event.</p>
              : convs.map((c) => (
                <button key={c.id} onClick={() => openConv(c)} role="listitem"
                  className="focusable block w-full border-b p-3 text-start text-sm hover:opacity-90"
                  style={{ borderColor: 'var(--border)', background: sel?.id === c.id ? 'var(--surface-2)' : 'transparent' }}>
                  <div className="flex items-center justify-between gap-2">
                    <b>{c.external_ref?.slice(0, 24)}</b>
                    <span className="badge">{c.channel_kind}</span>
                  </div>
                  <div className="muted truncate text-xs">{c.last_message?.body ?? '—'}</div>
                  <div className="mt-1 flex gap-1">
                    {c.unread_count > 0 && <span className="badge badge-warn">{c.unread_count} new</span>}
                    {c.mode === 'human' && <span className="badge badge-ok">human</span>}
                    {c.status === 'closed' && <span className="badge">closed</span>}
                  </div>
                </button>
              ))}
        </div>
        <div className="card flex min-h-[420px] flex-col p-0">
          {!sel ? <p className="m-auto muted">Select a conversation</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: 'var(--border)' }}>
                <b className="text-sm">{sel.external_ref}</b>
                <span className="badge">{sel.channel_kind}</span>
                <span className="grow" />
                <button className="btn btn-ghost text-xs" onClick={() => setMode(sel.mode === 'human' ? 'ai' : 'human')}>
                  {sel.mode === 'human' ? 'Release to AI' : 'Take over (human)'}
                </button>
                {sel.status !== 'closed' && <button className="btn btn-ghost text-xs" onClick={closeConv}>Close</button>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4" ref={logRef} aria-live="polite">
                {msgs.map((m) => (
                  <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'in' ? 'self-start' : 'self-end ms-auto'}`}
                    style={m.direction === 'in'
                      ? { background: 'var(--surface-2)' }
                      : { background: 'var(--primary)', color: 'var(--on-primary)' }}>
                    {m.body}
                    <div className="mt-1 text-[10px] opacity-70">{m.status}</div>
                  </div>
                ))}
              </div>
              <form className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--border)' }}
                onSubmit={(e) => { e.preventDefault(); sendReply(); }}>
                <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" disabled={sel.status === 'closed'} />
                <button className="btn btn-primary" disabled={busy || sel.status === 'closed'}>{busy ? '…' : 'Send'}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
