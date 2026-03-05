'use client';

import { Analytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';

// Vercel Analytics only works on Vercel-hosted deployments.
// NEXT_PUBLIC_VERCEL_ENV is automatically set by Vercel at build time.
// On self-hosted (VPS) it is undefined → skip rendering to avoid 404.
const IS_VERCEL = !!process.env.NEXT_PUBLIC_VERCEL_ENV;

export function RouteAnalytics() {
  const pathname = usePathname();

  if (!IS_VERCEL || pathname?.startsWith('/admin')) {
    return null;
  }

  return <Analytics />;
}
