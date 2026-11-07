'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '../../lib/api';

// Dev workspace provisioning (ADR-0004). Production replaces this screen's
// submit with Supabase Auth sign-in — UI contract unchanged.
export default function LoginPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/dev/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_name: tenantName || 'My Workspace', user_email: email, plan: 'growth', roles: ['owner'] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Login failed');
      localStorage.setItem('gcc_token', body.token);
      localStorage.setItem('gcc_tenant', body.tenant.name);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl font-extrabold text-white" style={{ background: 'linear-gradient(135deg, var(--primary), var(--ai))' }}>G</span>
          <div>
            <h1 className="text-lg font-extrabold">GCC-CRM</h1>
            <p className="text-xs muted">AI business platform · العربية / English</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold muted">Workspace name</span>
            <input className="input mt-1" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Acme FZ LLC" required />
          </label>
          <label className="block">
            <span className="text-sm font-semibold muted">Work email</span>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ae" required />
          </label>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Enter workspace'}
          </button>
          <p className="text-xs muted">Development auth — production uses Supabase Auth with MFA/SSO.</p>
        </form>
      </div>
    </main>
  );
}
