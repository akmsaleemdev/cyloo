'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Invoice = { id: string; number?: string; status: string; currency: string; total: number; remaining: number };

export default function CommercePage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [taxRates, setTaxRates] = useState<Array<{ country: string; rate_pct: number; source_url: string; verified_on: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inv, setInv] = useState({ desc: 'Licence', qty: 1, price: '1000.00' });
  const [tax, setTax] = useState({ country: 'AE', rate_pct: 5, source_url: '', verified_on: new Date().toISOString().slice(0, 10) });

  const load = useCallback(async () => {
    try {
      setInvoices((await api<{ invoices: Invoice[] }>('/api/v1/commerce/invoices')).invoices);
      setTaxRates((await api<{ tax_rates: any[] }>('/api/v1/commerce/tax-rates')).tax_rates);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Commerce</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      {notice && <div className="card p-3 text-sm" style={{ color: 'var(--ok)' }} role="status">{notice}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            await api('/api/v1/commerce/tax-rates', { method: 'POST', body: JSON.stringify(tax) });
            setNotice(`Tax rate for ${tax.country} recorded with source evidence.`);
            await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">Verified tax rate (regulatory gate)</b>
          <div className="flex gap-2">
            <select className="input" value={tax.country} onChange={(e) => setTax({ ...tax, country: e.target.value })}>
              {['AE', 'SA', 'QA', 'KW', 'BH', 'OM'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="input" type="number" step="0.5" value={tax.rate_pct} onChange={(e) => setTax({ ...tax, rate_pct: Number(e.target.value) })} aria-label="Rate %" />
          </div>
          <input className="input" required placeholder="Official source URL" value={tax.source_url} onChange={(e) => setTax({ ...tax, source_url: e.target.value })} />
          <button className="btn btn-ghost">Save verified rate</button>
          {taxRates.length > 0 && <p className="muted text-xs">{taxRates.map((t) => `${t.country} ${t.rate_pct}%`).join(' · ')}</p>}
        </form>
        <form className="card space-y-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try {
            await api('/api/v1/commerce/invoices', { method: 'POST', body: JSON.stringify({ currency: 'AED', country: 'AE', lines: [{ description: inv.desc, qty: Number(inv.qty), unit_price: inv.price, tax_pct: 5 }] }) });
            setNotice('Draft invoice created (server-computed totals).'); setInv({ desc: 'Licence', qty: 1, price: '1000.00' }); await load();
          } catch (err: any) { setError(err.message); }
        }}>
          <b className="text-sm">New invoice (AED, VAT 5%)</b>
          <div className="flex gap-2">
            <input className="input" required placeholder="Description" value={inv.desc} onChange={(e) => setInv({ ...inv, desc: e.target.value })} />
            <input className="input" type="number" min={1} value={inv.qty} onChange={(e) => setInv({ ...inv, qty: Number(e.target.value) })} aria-label="Qty" />
            <input className="input" required placeholder="Unit price" value={inv.price} onChange={(e) => setInv({ ...inv, price: e.target.value })} />
          </div>
          <button className="btn btn-primary">Create draft</button>
        </form>
      </div>
      <div className="card p-0">
        {invoices === null ? <p className="p-4 muted" role="status">Loading…</p> : invoices.length === 0 ? <p className="p-4 muted">No invoices yet.</p> : (
          <table className="data">
            <thead><tr><th>Number</th><th>Status</th><th>Total</th><th>Remaining</th><th></th></tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number ?? '(draft)'}</td>
                <td><span className={`badge ${i.status === 'paid' ? 'badge-ok' : i.status === 'issued' ? 'badge-warn' : ''}`}>{i.status}</span></td>
                <td>{(i.total / 100).toLocaleString()} {i.currency}</td>
                <td>{(i.remaining / 100).toLocaleString()} {i.currency}</td>
                <td className="space-x-1">
                  {i.status === 'draft' && <button className="btn btn-primary text-xs" onClick={async () => {
                    try { await api(`/api/v1/commerce/invoices/${i.id}/issue`, { method: 'POST', body: '{}' }); await load(); }
                    catch (e: any) { setError(e.message); }
                  }}>Issue</button>}
                  {i.status === 'issued' && <button className="btn btn-ghost text-xs" onClick={async () => {
                    try {
                      const r = await api<{ webhook_secret: string; link: { id: string } }>('/api/v1/commerce/payment-links', { method: 'POST', body: JSON.stringify({ invoice_id: i.id, gateway: 'sandbox' }) });
                      setNotice(`Sandbox payment link created. To simulate the gateway paying ${(i.remaining / 100).toLocaleString()} ${i.currency}, POST /api/v1/payments/webhook with x-signature = HMAC-SHA256(raw body, ${r.webhook_secret.slice(0, 10)}…). Secret shown once.`);
                      await load();
                    } catch (e: any) { setError(e.message); }
                  }}>Payment link</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
