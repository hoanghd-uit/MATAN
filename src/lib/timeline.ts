import type { TelemetryRow, TimelineEvent } from '@/types';

const TIMESTAMP_COLUMN = '[control]timestamp_unix';

export function buildTimelineEvents(data: TelemetryRow[]): TimelineEvent[] {
  if (data.length === 0) return [];

  const timestamps = data.map((row, i) => ({
    raw: parseInt(row[TIMESTAMP_COLUMN], 10),
    rowIndex: i,
  }));

  // Sort by timestamp (should already be sorted, but ensure)
  timestamps.sort((a, b) => a.raw - b.raw);

  const minTs = timestamps[0].raw;

  return timestamps.map(({ raw, rowIndex }) => ({
    relativeTime: (raw - minTs) / 1000, // ms to seconds
    rowIndex,
    rawTimestamp: raw,
  }));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Find the timeline event index closest to a given relative time
 */
export function findClosestEventIndex(events: TimelineEvent[], time: number): number {
  if (events.length === 0) return 0;
  let closest = 0;
  let minDiff = Math.abs(events[0].relativeTime - time);
  for (let i = 1; i < events.length; i++) {
    const diff = Math.abs(events[i].relativeTime - time);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}

/**
 * Parse image filename like image_00020034.jpg into relative seconds
 * HHMMSScc format -> hours, minutes, seconds, centiseconds (10ms)
 */
export function parseImageFilenameToTime(filename: string): number | null {
  const match = filename.match(/image_(\d{8})\b/i);
  if (!match) return null;
  const digits = match[1];
  const hh = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const ss = parseInt(digits.slice(4, 6), 10);
  const cc = parseInt(digits.slice(6, 8), 10);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss) || isNaN(cc)) return null;
  return hh * 3600 + mm * 60 + ss + cc / 100;
}

/**
 * Parse standard timestamp input like HH:MM:SS or MM:SS into total seconds.
 */
export function parseStringToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

/**
 * Format total seconds into a standard HH:MM:SS timestamp string.
 */
export function formatSecondsToString(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
