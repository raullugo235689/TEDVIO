import type { AgendaOccurrence } from './types';

export const timetablePixelsPerMinute = 2;
const minimumMinutes = 26; // Keep even very short classes touchable (44 px + spacing).
export function timeMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function timetableBounds(occurrences: AgendaOccurrence[]) {
  const starts = occurrences.map(item => timeMinutes(item.slot.start_time));
  const ends = occurrences.map(item => Math.max(timeMinutes(item.slot.end_time), timeMinutes(item.slot.start_time) + minimumMinutes));
  const start = starts.length ? Math.min(20 * 60, Math.floor(Math.min(...starts) / 60) * 60) : 7 * 60;
  const end = ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 15 * 60;
  return { start, end: Math.max(start + 4 * 60, end) };
}

/** Separate simultaneous classes into lanes, including the visual footprint of short classes. */
export function layoutTimetableDay(occurrences: AgendaOccurrence[]) {
  const entries = occurrences.map(occurrence => ({
    occurrence,
    start: timeMinutes(occurrence.slot.start_time),
    end: Math.max(timeMinutes(occurrence.slot.end_time), timeMinutes(occurrence.slot.start_time) + minimumMinutes),
    lane: 0,
    lanes: 1,
  })).sort((a, b) => a.start - b.start || b.end - a.end || a.occurrence.slot.id.localeCompare(b.occurrence.slot.id));
  let cluster: typeof entries = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const finish = () => { for (const item of cluster) item.lanes = laneEnds.length; };
  for (const entry of entries) {
    if (entry.start >= clusterEnd) { finish(); cluster = []; laneEnds = []; }
    const available = laneEnds.findIndex(end => end <= entry.start);
    entry.lane = available === -1 ? laneEnds.length : available;
    laneEnds[entry.lane] = entry.end;
    cluster.push(entry);
    clusterEnd = Math.max(...laneEnds);
  }
  finish();
  return entries;
}
