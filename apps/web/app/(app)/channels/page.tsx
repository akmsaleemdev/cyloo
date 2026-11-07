'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Channel = { id: string; kind: string; display_name: string; status: string; capabilities: { ops: string[]; prerequisites: string; note: string }; webhook_url: string };

const KINDS = ['webchat', 'whatsapp', 'instagram', 'messenger', 'tiktok', 'snapchat', 'email', 'sms'];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState('webchat');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try { setChannels((await api<{ channels: Channel[] }>('/api/v1/channels')).channels); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNotice(null);
    try {
      const res = await api<{ widget_key: string | null; note: string }>('/api/v1/channels', { method: 'POST', body: JSON.stringify({ kind, display_name: name || kind }) });
      setNotice(res.note + (res.widget_key ? ` Widget key: ${res.widget_key}` : ''));
      await load();
    } catch (err: any) { setError(err.message); }
  }
  async function sandbox(c: Channel) {
    try {
      const res = await api<{ note: string }>(`/api/v1/channels/${c.id}/configure-sandbox`, { method: 'POST', body: '{}' });
      setNotice(res.note);
      await load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Channels</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--warn)' }} role="status">{notice}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={create}>
        <label className="block">
          <span className="text-xs font-bold uppercase muted">Channel</span>
          <select className="input mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-40">
          <span className="text-xs font-bold uppercase muted">Display name</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Website chat" />
        </label>
        <button className="btn btn-primary">Add channel</button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        {channels === null ? <p className="muted" role="status">Loading…</p>
          : channels.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between">
                <b className="text-sm capitalize">{c.display_name} <span className="muted">({c.kind})</span></b>
                <span className={`badge ${c.status === 'connected' ? 'badge-ok' : 'badge-warn'}`}>{c.status}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{c.capabilities.ops.map((o) => <span key={o} className="badge">{o}</span>)}</div>
              <p className="muted mt-2 text-xs">Prerequisites: {c.capabilities.prerequisites}</p>
              <p className="muted text-xs">{c.capabilities.note}</p>
              <div className="mt-3 flex gap-2">
                {c.status === 'unconfigured' && (
                  <button className="btn btn-ghost text-xs" onClick={() => sandbox(c)}>Configure sandbox (test double)</button>
                )}
                <code className="self-center text-[10px] muted">POST {c.webhook_url}</code>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
