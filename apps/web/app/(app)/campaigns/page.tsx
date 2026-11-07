'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Campaign = { id: string; name: string; channel_kind: string; status: string; metrics: Record<string, number> | null; ab_variant_of?: string | null };

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; channel_kind: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', channel_kind: 'email', template_id: '' });
  const [tpl, setTpl] = useState({ name: '', body: 'Hi {{first_name}} —' });

  const load = useCallback(async () => {
    try {
      setCampaigns((await api<{ campaigns: Campaign[] }>('/api/v1/marketing/campaigns')).campaigns);
      setTemplates((await api<{ templates: any[] }>('/api/v1/marketing/templates')).templates);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Campaigns</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            await api('/api/v1/marketing/templates', { method: 'POST', body: JSON.stringify({ channel_kind: 'email', name: tpl.name, body: tpl.body, language: 'en' }) });
            setNotice('Template saved.'); setTpl({ name: '', body: 'Hi {{first_name}} —' }); await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">Template library</b>
          <label className="block"><span className="text-xs font-bold uppercase muted">Name</span>
            <input className="input mt-1" required value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-bold uppercase muted">Body ({'{{first_name}}'} supported)</span>
            <textarea className="input mt-1" required value={tpl.body} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} /></label>
          <button className="btn btn-ghost">Save template</button>
        </form>
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            // audience from the first segment snapshot; create one if needed
            const segs = await api<{ body?: { segment: { id: string } }; segment?: { id: string } }>('/api/v1/segments', { method: 'POST', body: JSON.stringify({ name: `Aud ${Date.now()}`, filters: {} }) }).catch(() => null);
            const aud = await api<{ audience: { id: string } }>('/api/v1/marketing/audiences', { method: 'POST', body: JSON.stringify({ name: `Audience ${Date.now()}`, segment_id: (segs?.segment ?? segs?.body?.segment)!.id }) });
            void aud;
            await api('/api/v1/marketing/campaigns', { method: 'POST', body: JSON.stringify({ name: form.name, channel_kind: form.channel_kind, template_id: form.template_id || undefined, audience_id: aud.audience.id }) });
            setNotice('Campaign created (draft). Consent + suppression checked at send.');
            await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">New campaign (audience = all contacts snapshot)</b>
          <label className="block"><span className="text-xs font-bold uppercase muted">Name</span>
            <input className="input mt-1" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-bold uppercase muted">Channel</span>
            <select className="input mt-1" value={form.channel_kind} onChange={(e) => setForm({ ...form, channel_kind: e.target.value })}>
              <option value="email">email</option><option value="whatsapp">whatsapp</option><option value="sms">sms</option>
            </select></label>
          <label className="block"><span className="text-xs font-bold uppercase muted">Template</span>
            <select className="input mt-1" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
              <option value="">— plain greeting —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <button className="btn btn-primary">Create campaign</button>
        </form>
      </div>
      <div className="card p-0">
        {campaigns === null ? <p className="p-4 muted" role="status">Loading…</p> : campaigns.length === 0 ? <p className="p-4 muted">No campaigns yet.</p> : (
          <table className="data">
            <thead><tr><th>Name</th><th>Channel</th><th>Status</th><th>Metrics</th><th></th></tr></thead>
            <tbody>{campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name} {c.ab_variant_of && <span className="badge">variant</span>}</td>
                <td>{c.channel_kind}</td>
                <td><span className={`badge ${c.status === 'completed' ? 'badge-ok' : ''}`}>{c.status}</span></td>
                <td className="text-xs">{c.metrics ? Object.entries(c.metrics).map(([k, v]) => `${k}:${v}`).join(' · ') : '—'}</td>
                <td>{c.status !== 'completed' && !c.ab_variant_of && (
                  <button className="btn btn-primary text-xs" onClick={async () => {
                    try {
                      const r = await api<{ metrics: Record<string, number> }>(`/api/v1/marketing/${c.id}/send`, { method: 'POST', body: '{}' });
                      setNotice(`Sent: ${r.metrics.sent}, skipped (no consent): ${r.metrics.skipped_consent}, suppressed: ${r.metrics.skipped_suppressed}, capped: ${r.metrics.skipped_frequency_cap}`);
                      await load();
                    } catch (e: any) { setError(e.message); }
                  }}>Send now</button>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
