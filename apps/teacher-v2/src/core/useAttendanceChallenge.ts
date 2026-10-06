import { useEffect, useState } from 'react';
import { fetchAttendanceChallenge } from './joint-attendance';

interface CurrentChallenge { proof: string; code: string; validUntil: number }

// Secrets live only in this mounted control. Only the teacher fetches once per minute.
export function useAttendanceChallenge(eventId: string, enabled: boolean, online: boolean) {
  const [data, setData] = useState<CurrentChallenge | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setData(null); setError('');
    if (!enabled || !online) return;
    let current = true; let busy = false; let timer: number | undefined;
    async function refresh() {
      if (!current || busy) return;
      window.clearTimeout(timer);
      busy = true;
      const started = Date.now();
      try {
        const next = await fetchAttendanceChallenge(eventId);
        if (!current) return;
        const received = Date.now();
        if (!next.available) { setData(null); return; }
        if (!next.qr_proof || !next.code || !next.expires_at) throw new Error('No se pudo renovar el código.');
        // Subtract round-trip time so a slow response never extends a code's life.
        const remaining = Math.max(0, Date.parse(next.expires_at) - Date.parse(next.server_now) - (received - started));
        setData({ proof: next.qr_proof, code: next.code, validUntil: received + remaining });
        setError('');
        timer = window.setTimeout(() => void refresh(), Math.max(1000, remaining + 100));
      } catch (reason) {
        if (!current) return;
        setData(null); setError(reason instanceof Error ? reason.message : 'No se pudo renovar el código.');
        timer = window.setTimeout(() => void refresh(), 5000);
      } finally { busy = false; }
    }
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { current = false; window.clearTimeout(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [eventId, enabled, online, attempt]);
  return { data: enabled && online ? data : null, error, retry: () => setAttempt(n => n + 1) };
}
