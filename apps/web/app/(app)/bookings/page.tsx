'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Appt = { id: string; starts_at: string; ends_at: string; status: string; timezone: string };
type Slot = { starts_at: string; local: string };

export default function BookingsPage() {
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staff, setStaff] = useState({ name: '', tz: 'Asia/Dubai' });
  const [page, setPage] = useState({ slug: '', duration: 30 });
  const [staffId, setStaffId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotDate, setSlotDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try { setAppts((await api<{ appointments: Appt[] }>('/api/v1/scheduling/appointments')).appointments); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadSlots = useCallback(async (slug: string, date: string) => {
    if (!slug) return;
    try { setSlots((await api<{ slots: Slot[] }>(`/api/v1/scheduling/booking-pages/${slug}/slots?date=${date}`)).slots); }
    catch { setSlots([]); }
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Scheduling</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            const s = await api<{ staff: { id: string } }>('/api/v1/scheduling/staff', { method: 'POST', body: JSON.stringify({ display_name: staff.name, timezone: staff.tz }) });
            setStaffId(s.staff.id); setNotice(`Staff created (${staff.tz}). Add availability next.`);
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">1 · Add staff</b>
          <label className="block"><span className="text-xs font-bold uppercase muted">Name</span>
            <input className="input mt-1" required value={staff.name} onChange={(e) => setStaff({ ...staff, name: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-bold uppercase muted">Timezone (GCC)</span>
            <select className="input mt-1" value={staff.tz} onChange={(e) => setStaff({ ...staff, tz: e.target.value })}>
              {['Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat'].map((t) => <option key={t}>{t}</option>)}
            </select></label>
          <button className="btn btn-primary">Create</button>
        </form>
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            await api('/api/v1/scheduling/availability', { method: 'POST', body: JSON.stringify({ staff_id: staffId, weekday: 1, start_time: '09:00', end_time: '17:00' }) });
            const p = await api<{ page: { slug: string } }>('/api/v1/scheduling/booking-pages', { method: 'POST', body: JSON.stringify({ slug: page.slug, staff_id: staffId, service_name: 'Meeting', duration_min: Number(page.duration) }) });
            setNotice(`Booking page ready: ${p.page.slug}`);
            await loadSlots(page.slug, slotDate);
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">2 · Availability + booking page (Mon 09:00–17:00)</b>
          <label className="block"><span className="text-xs font-bold uppercase muted">Page slug</span>
            <input className="input mt-1" required pattern="[a-z0-9-]{3,40}" value={page.slug} onChange={(e) => setPage({ ...page, slug: e.target.value })} placeholder="demo-call" /></label>
          <label className="block"><span className="text-xs font-bold uppercase muted">Duration (min)</span>
            <input className="input mt-1" type="number" min={10} max={480} value={page.duration} onChange={(e) => setPage({ ...page, duration: Number(e.target.value) })} /></label>
          <button className="btn btn-primary" disabled={!staffId}>Create page</button>
        </form>
      </div>
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="text-xs font-bold uppercase muted">Slots for date</span>
            <input className="input mt-1" type="date" value={slotDate} onChange={(e) => { setSlotDate(e.target.value); loadSlots(page.slug, e.target.value); }} /></label>
          <button className="btn btn-ghost text-xs" onClick={() => loadSlots(page.slug, slotDate)} disabled={!page.slug}>Refresh</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {slots === null ? <span className="muted text-sm">Create a booking page to see open slots.</span>
            : slots.length === 0 ? <span className="muted text-sm">No open slots for this date.</span>
              : slots.map((s) => (
                <button key={s.starts_at} className="btn btn-ghost text-xs" onClick={async () => {
                  try {
                    await api('/api/v1/scheduling/appointments', { method: 'POST', body: JSON.stringify({ slug: page.slug, starts_at: s.starts_at }) });
                    setNotice(`Booked ${s.local} (${s.starts_at}).`); await loadSlots(page.slug, slotDate); await load();
                  } catch (err: any) { setError(err.message); }
                }}>{s.local}</button>
              ))}
        </div>
      </div>
      <div className="card p-0">
        {appts === null ? <p className="p-4 muted" role="status">Loading…</p> : appts.length === 0 ? (
          <p className="p-4 muted">No appointments yet — pick a slot above.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Starts (UTC)</th><th>Timezone</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {appts.map((a) => (
                <tr key={a.id}>
                  <td>{a.starts_at.slice(0, 16).replace('T', ' ')}</td><td>{a.timezone}</td>
                  <td><span className={`badge ${a.status === 'cancelled' || a.status === 'no_show' ? 'badge-warn' : 'badge-ok'}`}>{a.status}</span></td>
                  <td className="space-x-1">
                    <button className="btn btn-ghost text-xs" onClick={async () => {
                      try { await api(`/api/v1/scheduling/appointments/${a.id}/cancel`, { method: 'POST', body: '{}' }); await load(); }
                      catch (e: any) { setError(e.message); }
                    }}>Cancel</button>
                    <button className="btn btn-ghost text-xs" onClick={async () => {
                      try { await api(`/api/v1/scheduling/appointments/${a.id}/no-show`, { method: 'POST', body: '{}' }); await load(); }
                      catch (e: any) { setError(e.message); }
                    }}>No-show</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
