'use client';

import { useState } from 'react';
import { track } from '@vercel/analytics';

export function VercelAnalyticsButton() {
  const [sent, setSent] = useState(false);

  const handleClick = () => {
    track('admin_vercel_analytics_button_click', {
      location: 'admin_header',
      timestamp: new Date().toISOString(),
    });
    setSent(true);
    window.setTimeout(() => setSent(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-5 py-3 rounded-2xl border-[3px] border-[#60a5fa] text-[#60a5fa] font-black tracking-[0.2em] hover:bg-[#60a5fa]/10 transition"
      title="Отправить тестовое событие в Vercel Analytics"
    >
      {sent ? 'Отправлено ✓' : 'Vercel Analytics'}
    </button>
  );
}
