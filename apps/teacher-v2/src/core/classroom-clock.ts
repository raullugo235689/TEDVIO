/**
 * Shared authoritative-clock math for TEDVIO Student, Projection and Teacher.
 * Offset is estimated at the midpoint of the request/response window so that
 * high network latency does not grant or remove extra answering time.
 */
export function estimateServerClockOffset(
  serverTimestamp: string | null | undefined,
  requestStartMs: number,
  responseEndMs: number,
): number | null {
  const serverMs = Date.parse(serverTimestamp || '');
  if (!Number.isFinite(serverMs) || !Number.isFinite(requestStartMs)
      || !Number.isFinite(responseEndMs) || responseEndMs < requestStartMs) return null;
  const roundTrip = responseEndMs - requestStartMs;
  if (roundTrip > 15_000) return null;
  return serverMs - (requestStartMs + roundTrip / 2);
}

export function classroomSecondsRemaining(
  launchedAt: string | null | undefined,
  timerSeconds: number | null | undefined,
  clockOffsetMs = 0,
  localNowMs = Date.now(),
): number {
  if (!launchedAt) return 0;
  const launchedMs = Date.parse(launchedAt);
  if (!Number.isFinite(launchedMs)) return 0;
  const duration = Number(timerSeconds) || 30;
  return Math.max(0, Math.ceil(duration - (localNowMs + clockOffsetMs - launchedMs) / 1000));
}
