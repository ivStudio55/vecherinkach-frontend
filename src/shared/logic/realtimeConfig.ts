export const isRealtimeEnabled = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('disableRealtime');
    if (stored === 'true') {
      return false;
    }
  }
  return process.env.NEXT_PUBLIC_DISABLE_REALTIME !== 'true';
};
