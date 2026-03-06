'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Ошибка входа');
        return;
      }
      const from = searchParams.get('from') ?? '/admin';
      router.push(from);
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fef4dc] flex items-center justify-center px-4">
      <div className="retro-panel bg-[#142a45] text-[#ffeccd] p-8 max-w-sm w-full">
        <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/60 text-center mb-1">Вечеринкач</p>
        <h1 className="text-3xl font-black tracking-[0.2em] mb-8 text-center">ADMIN</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
            autoFocus
            className="px-4 py-3 rounded-2xl border-[3px] border-[#ffeccd]/40 bg-transparent text-[#ffeccd] placeholder-[#ffeccd]/40 font-bold focus:outline-none focus:border-[#ffeccd]"
          />
          {error && <p className="text-red-400 font-bold text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="px-6 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition disabled:opacity-50"
          >
            {loading ? '...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
