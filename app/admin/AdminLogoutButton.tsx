'use client';

import { useRouter } from 'next/navigation';

export function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd]/50 text-[#ffeccd]/70 font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
    >
      Выйти
    </button>
  );
}
