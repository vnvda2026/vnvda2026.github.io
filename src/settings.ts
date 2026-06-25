export type SearchMode = 'all' | 'will-watch' | 'watching' | 'completed';

export type AppSettings = {
  searchMode: SearchMode;
  tags: string[];
};

const SETTINGS_KEY = 'conference-talks.settings-v1';

const DEFAULT_SETTINGS: AppSettings = {
  searchMode: 'all',
  tags: [],
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      searchMode: isSearchMode(parsed.searchMode) ? parsed.searchMode : DEFAULT_SETTINGS.searchMode,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(normalizeTag).filter(Boolean) : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ');
}

export function addTag(tags: string[], tag: string): string[] {
  const normalized = normalizeTag(tag);
  if (!normalized) {
    return tags;
  }

  const nextTags = [...tags];
  if (!nextTags.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    nextTags.push(normalized);
  }

  return nextTags;
}

export function removeTag(tags: string[], tag: string): string[] {
  const lower = tag.toLowerCase();
  return tags.filter((item) => item.toLowerCase() !== lower);
}

export function isSearchMode(value: unknown): value is SearchMode {
  return value === 'all' || value === 'will-watch' || value === 'watching' || value === 'completed';
}