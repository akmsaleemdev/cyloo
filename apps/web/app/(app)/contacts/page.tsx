'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Contact = { id: string; first_name: string; last_name?: string; email?: string; lifecycle_stage: string };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ first_name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api<{ contacts: Contact[] }>(`/api/v1/contacts?limit=100${filter ? `&q=${encodeURIComponent(filter)}` : ''}`);
      setContacts(res.contacts);
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNotice(null);
    try {
      await api('/api/v1/contacts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ first_name: '', email: '' });
      setNotice('Contact created');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Contacts</h1>
        <input className="input max-w-xs" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search contacts" />
      </div>
      {error && <div className="card p-4" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-4" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={create}>
        <label className="block flex-1 min-w-40">
          <span className="text-xs font-bold uppercase muted">First name</span>
          <input className="input mt-1" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </label>
        <label className="block flex-1 min-w-40">
          <span className="text-xs font-bold uppercase muted">Email</span>
          <input className="input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add contact'}</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {contacts === null ? (
          <p className="p-6 muted" role="status">Loading…</p>
        ) : contacts.length === 0 ? (
          filter
            ? <div className="p-6 text-center" role="status">
                <p className="muted">No contacts match “{filter}”.</p>
                <button className="btn btn-ghost mt-2 text-xs" onClick={() => setFilter('')}>Clear search</button>
              </div>
            : <p className="p-6 muted">No contacts yet — add your first one above.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Stage</th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</td>
                  <td className="muted">{c.email ?? '—'}</td>
                  <td><span className="badge">{c.lifecycle_stage}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
