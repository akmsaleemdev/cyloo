'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type KeyRow = { id: string; name: string; roles: string[]; revoked_at?: string | null };
type Hook = { id: string; url: string; events: string[]; deliveries: number; revoked_at?: string | null };

export default function PlatformPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [pack, setPack] = useState('real_estate');
  const [packs, setPacks] = useState<Array<{ key: string; label: string }>>([]);

  const load = useCallback(async () => {
    try {
      setKeys((await api<{ keys: KeyRow[] }>('/api/v1/platform/api-keys')).keys);
      setHooks((await api<{ webhooks: Hook[] }>('/api/v1/platform/outbound-webhooks')).webhooks);
      setPacks((await api<{ packs: any[] }>('/api/v1/platform/industry-packs')).packs);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Platform & Developer</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--warn)' }} role="status">{notice}</div>}
      {rawKey && (
        <div className="card p-4" style={{ borderColor: 'var(--warn)' }}>
          <b className="text-sm">⚠️ Copy your API key now — shown once:</b>
          <code className="mt-1 block break-all text-xs">{rawKey}</code>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            const r = await api<{ raw_key: string }>('/api/v1/platform/api-keys', { method: 'POST', body: JSON.stringify({ name: keyName, roles: ['sales_rep'] }) });
            setRawKey(r.raw_key); setKeyName(''); await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">API keys (M2M)</b>
          <input className="input" required placeholder="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <button className="btn btn-primary">Create key (role: sales_rep)</button>
          <table className="data"><thead><tr><th>Name</th><th>Roles</th><th></th></tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k.id}><td>{k.name}</td><td className="text-xs">{k.roles.join(',')}</td>
                <td>{!k.revoked_at && <button className="btn btn-ghost text-xs" onClick={async () => { try { await api(`/api/v1/platform/api-keys/${k.id}/revoke`, { method: 'POST', body: '{}' }); await load(); } catch (e: any) { setError(e.message); } }}>Revoke</button>}</td></tr>
            ))}</tbody></table>
        </form>
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            const r = await api<{ secret: string }>('/api/v1/platform/outbound-webhooks', { method: 'POST', body: JSON.stringify({ url: hookUrl, events: ['contact.created', 'lead.created', 'opportunity.won'] }) });
            setNotice(`Webhook registered. Signing secret (store it): ${r.secret}`);
            setHookUrl(''); await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">Outbound webhooks (HMAC-signed, DLQ on failure)</b>
          <input className="input" required placeholder="https://your-app.example/hook (public only)" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
          <button className="btn btn-primary">Register</button>
          <table className="data"><thead><tr><th>URL</th><th>Deliveries</th><th></th></tr></thead>
            <tbody>{hooks.map((h) => (
              <tr key={h.id}><td className="max-w-40 truncate text-xs">{h.url}</td><td>{h.deliveries}</td>
                <td><button className="btn btn-ghost text-xs" onClick={async () => { try { const r = await api<{ note: string }>(`/api/v1/platform/outbound-webhooks/${h.id}/test-fire`, { method: 'POST', body: '{}' }); setNotice(r.note); await load(); } catch (e: any) { setError(e.message); } }}>Test-fire</button></td></tr>
            ))}</tbody></table>
        </form>
      </div>
      <div className="card p-4">
        <b className="text-sm">Industry pack (configuration-driven vertical setup)</b>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="input max-w-64" value={pack} onChange={(e) => setPack(e.target.value)}>
            {packs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={async () => {
            try {
              const r = await api<{ fields_created: string[]; pipeline: string }>(`/api/v1/platform/industry-pack/${pack}/activate`, { method: 'POST', body: '{}' });
              setNotice(`Pack activated: fields [${r.fields_created.join(', ') || 'none new'}], pipeline "${r.pipeline}".`);
            } catch (e: any) { setError(e.message); }
          }}>Activate pack</button>
        </div>
      </div>
      <div className="card p-4">
        <b className="text-sm">DR drill</b>
        <p className="muted mt-1 text-xs">GET /api/v1/platform/backup → JSON snapshot · POST /api/v1/platform/restore → verified by the e2e suite. Production maps to PostgreSQL PITR (runbook).</p>
      </div>
    </div>
  );
}
