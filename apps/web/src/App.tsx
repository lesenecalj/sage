import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'available' | 'unavailable';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        setApiStatus(response.ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setApiStatus('unavailable');
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="grid min-h-screen content-center bg-[linear-gradient(135deg,rgba(208,231,214,0.55),transparent_48%)] px-8 py-8 font-serif text-[#20302b]">
      <div className="mx-auto w-full max-w-3xl">
        <p className="m-0 font-sans text-xs font-bold tracking-[0.08em] text-[#5b7166] uppercase">
          Software Assistant for Guided Engineering
        </p>
        <h1 className="mt-1 text-6xl font-normal sm:text-8xl">SAGE</h1>
        <p className="max-w-2xl text-xl leading-relaxed">
        Your personal knowledge assistant is ready for its first capability: notes.
        </p>
        <p
          className={`mt-4 w-fit rounded px-3 py-2 font-sans text-sm font-bold ${
            apiStatus === 'checking'
              ? 'bg-[#e6ddbd]'
              : apiStatus === 'available'
                ? 'bg-[#bfe1c3]'
                : 'bg-[#f2c7bc]'
          }`}
          aria-live="polite"
        >
          API: {apiStatus}
        </p>
      </div>
    </main>
  );
}