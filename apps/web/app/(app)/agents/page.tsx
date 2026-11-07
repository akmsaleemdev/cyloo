'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';

type Agent = { id: string; name: string; kind: string; languages: string[] };
type Msg = { role: 'user' | 'assistant'; content: string; citations?: unknown[]; tools?: string[] };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [sel, setSel] = useState<Agent | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('support');
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setAgents((await api<{ agents: Agent[] }>('/api/v1/ai/agents')).agents); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);

  async function createAgent(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api('/api/v1/ai/agents', { method: 'POST', body: JSON.stringify({ name: name || 'Assistant', kind }) });
      setName(''); await load();
    } catch (err: any) { setError(err.message); }
  }

  async function send() {
    if (!input.trim()) return;
    const text = input; setInput('');
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setBusy(true); setError(null);
    try {
      const res = await api<{ reply: string; citations: unknown[]; tools: string[] }>('/api/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, agent_id: sel?.id }),
      });
      setMsgs((m) => [...m, { role: 'assistant', content: res.reply, citations: res.citations, tools: res.tools }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', content: `⚠️ ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">AI Agent Studio</h1>
      {error && <div className="card p-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</div>}
      <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={createAgent}>
        <label className="block"><span className="text-xs font-bold uppercase muted">Agent name</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support AR/EN" /></label>
        <label className="block"><span className="text-xs font-bold uppercase muted">Kind</span>
          <select className="input mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="support">support</option><option value="qualify">qualify</option><option value="booking">booking</option>
          </select></label>
        <button className="btn btn-primary">Create agent</button>
        <span className="muted text-xs">Engine: deterministic-local (dev) — provider models at cutover only.</span>
      </form>
      <div className="flex flex-wrap gap-2">
        {(agents ?? []).map((a) => (
          <button key={a.id} onClick={() => { setSel(a); setMsgs([]); }}
            className="btn btn-ghost text-xs" style={sel?.id === a.id ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}>
            {a.name} · {a.kind}
          </button>
        ))}
      </div>
      <div className="card flex min-h-[380px] flex-col p-0">
        <div className="flex-1 space-y-2 overflow-y-auto p-4" ref={logRef} aria-live="polite">
          {msgs.length === 0 && <p className="muted text-sm">Try: “what is our security policy?” · “show me the pipeline” · “find contact layla” · “email omar@example.com” · “talk to a human”.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'ms-auto' : ''}`}
              style={m.role === 'user'
                ? { background: 'var(--primary)', color: 'var(--on-primary)' }
                : { background: 'var(--surface-2)', borderInlineStart: '3px solid var(--ai)' }}>
              {m.content}
              {!!m.tools?.length && <div className="mt-1 flex flex-wrap gap-1">{m.tools.map((t) => <span key={t} className="badge" style={{ background: 'color-mix(in srgb, var(--ai) 12%, transparent)', color: 'var(--ai)' }}>{t}</span>)}</div>}
            </div>
          ))}
        </div>
        <form className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--border)' }} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the assistant…" aria-label="Message" />
          <button className="btn btn-ai" disabled={busy}>{busy ? '…' : 'Send'}</button>
        </form>
      </div>
    </div>
  );
}
