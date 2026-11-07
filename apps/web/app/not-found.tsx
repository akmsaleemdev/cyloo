import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="mb-2 text-4xl font-extrabold" style={{ color: 'var(--primary)' }}>404</h1>
        <p className="muted mb-4">This page does not exist or has been moved.</p>
        <Link className="btn btn-primary" href="/dashboard">Back to dashboard</Link>
      </div>
    </main>
  );
}
