import type { PersistedProgress } from './types';

const PROGRESS_KEY = 'conference-talks.progress-v1';

export function readProgress(): Record<string, PersistedProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PersistedProgress>) : {};
  } catch {
    return {};
  }
}

export function writeProgress(progress: Record<string, PersistedProgress>): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}
