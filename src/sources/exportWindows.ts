import type { ListeningProfile } from '../spotify/profile';
import type { ListeningPeriod } from './periods';

/**
 * Every listening window's profile from the last Spotify data upload, so the
 * window can be switched without re-uploading. Kept apart from the importer so
 * switching doesn't load the zip reader.
 */
const KEY = 'festify.export.windows';
let windows: Partial<Record<ListeningPeriod, ListeningProfile>> | null = null;

export function saveExportWindows(all: Record<ListeningPeriod, ListeningProfile>) {
  windows = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Too big for storage: switching still works until the page is reloaded.
  }
}

/** A listening window from the last upload, or null if it's no longer available. */
export function exportWindow(period: ListeningPeriod): ListeningProfile | null {
  if (!windows) {
    try {
      windows = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      windows = null;
    }
  }
  return windows?.[period] ?? null;
}

/** Forget the uploaded data (on "Start over"). */
export function forgetExport() {
  windows = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
