'use client';

// Global error boundary (UX state 3): understandable message + retry,
// never a stack trace or internals.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mb-3 text-3xl">⚠️</div>
        <h1 className="mb-2 text-lg font-extrabold">Something went wrong</h1>
        <p className="muted mb-4 text-sm">
          An unexpected error occurred while loading this page. Your data is safe — please retry.
        </p>
        {error.digest && <p className="muted mb-4 text-[11px]">Reference: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <button className="btn btn-primary" onClick={reset}>Retry</button>
          <a className="btn btn-ghost" href="/dashboard">Go to dashboard</a>
        </div>
      </div>
    </main>
  );
}
