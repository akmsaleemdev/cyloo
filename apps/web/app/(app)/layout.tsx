'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', ar: 'لوحة التحكم' },
  { href: '/inbox', label: 'Inbox', ar: 'الصندوق' },
  { href: '/contacts', label: 'Contacts', ar: 'جهات الاتصال' },
  { href: '/deals', label: 'Deals', ar: 'الصفقات' },
  { href: '/leads', label: 'Leads', ar: 'العملاء المحتملون' },
  { href: '/agents', label: 'AI Studio', ar: 'الذكاء الاصطناعي' },
  { href: '/knowledge', label: 'Knowledge', ar: 'المعرفة' },
  { href: '/bookings', label: 'Bookings', ar: 'المواعيد' },
  { href: '/campaigns', label: 'Campaigns', ar: 'الحملات' },
  { href: '/workflows', label: 'Workflows', ar: 'سير العمل' },
  { href: '/reports', label: 'Reports', ar: 'التقارير' },
  { href: '/tickets', label: 'Service', ar: 'الخدمة' },
  { href: '/commerce', label: 'Commerce', ar: 'المبيعات' },
  { href: '/platform', label: 'Platform', ar: 'المنصة' },
  { href: '/channels', label: 'Channels', ar: 'القنوات' },
];

// Offline detection banner (UX state 4) — polls connectivity cheaply.
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [open, setOpen] = useState(false);
  const online = useOnline();

  useEffect(() => {
    const t = (localStorage.getItem('gcc_theme') as 'light' | 'dark') || 'light';
    const l = (localStorage.getItem('gcc_lang') as 'en' | 'ar') || 'en';
    setTheme(t); setLang(l);
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('gcc_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }
  function toggleLang() {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    localStorage.setItem('gcc_lang', next);
    document.documentElement.setAttribute('lang', next);
    document.documentElement.setAttribute('dir', next === 'ar' ? 'rtl' : 'ltr');
  }
  function logout() {
    localStorage.removeItem('gcc_token');
    router.push('/login');
  }

  const L = (item: typeof NAV[number]) => (lang === 'ar' ? item.ar : item.label);
  const tenant = typeof window !== 'undefined' ? localStorage.getItem('gcc_tenant') : null;

  return (
    <div className="min-h-screen lg:grid" style={{ gridTemplateColumns: '260px 1fr' }}>
      {!online && (
        <div role="alert" className="fixed inset-x-0 top-0 z-50 p-2 text-center text-sm font-bold text-white"
          style={{ background: 'var(--warn)' }}>
          ⚡ Offline — changes cannot be saved right now. Reconnecting automatically…
        </div>
      )}
      <aside
        className={`fixed inset-y-0 z-40 w-[260px] border-e p-4 lg:static transition-transform ${open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0'}`}
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl font-extrabold text-white" style={{ background: 'linear-gradient(135deg, var(--primary), var(--ai))' }}>G</span>
          <div>
            <b className="text-sm">GCC-CRM</b>
            <div className="text-[11px] muted">{tenant ?? 'workspace'}</div>
          </div>
        </div>
        <nav className="space-y-1" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className="focusable block rounded-full px-4 py-2 text-sm font-semibold"
                style={active
                  ? { background: 'color-mix(in srgb, var(--primary) 13%, transparent)', color: 'var(--primary)' }
                  : { color: 'var(--text-2)' }}>
                {L(n)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 flex gap-2">
          <button className="btn btn-ghost text-xs" onClick={toggleLang} aria-label="Toggle language">{lang === 'ar' ? 'English' : 'العربية'}</button>
          <button className="btn btn-ghost text-xs" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
        <button className="btn btn-ghost mt-2 w-full justify-center text-xs" onClick={logout}>Log out</button>
      </aside>
      <div>
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b px-5 py-3 lg:hidden" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <button className="btn btn-ghost px-3 py-1" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <b>GCC-CRM</b>
        </header>
        <main className="p-5">{children}</main>
      </div>
    </div>
  );
}
