import { useEffect, useState } from 'react';

/** Whole seconds left until `from + seconds` (0 when `from` is null); re-renders once a second. */
export function useCountdown(from: number | null, seconds: number): number {
  const [now, setNow] = useState(() => Date.now());
  const deadline = from === null ? null : from + seconds * 1000;

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (deadline === null) return 0;
  // `now` may lag by up to a tick right after a resend; never show more than the full timer.
  return Math.min(seconds, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
