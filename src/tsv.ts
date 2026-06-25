import type { ReportRecord } from './types';

const TSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSrAcf4eIz2syZ5yQYw8q1zX4QjWSlyjne5cT2PHgK1u78gjPOKKq1UdU_ksxrpiQQg4wQ0gRaWj_U_/pub?gid=746436738&single=true&output=tsv';
const CACHE_KEY = 'conference-talks.tsv-cache-v1';
const CACHE_TIME_KEY = 'conference-talks.tsv-cache-time-v1';

const headerMap: Record<string, string> = {
  'ngày': 'date',
  'phòng (tv)': 'room',
  'họ và tên': 'speaker',
  'báo cáo (tv)': 'reportVi',
  'báo cáo (ta)': 'reportEn',
  'link youtube': 'youtubeUrl',
  'link bài báo cáo': 'slidesUrl',
};

export type TsvLoadResult = {
  records: ReportRecord[];
  source: 'cache' | 'network';
  cachedAt: number | null;
};

export async function loadReports(forceReload = false): Promise<TsvLoadResult> {
  if (!forceReload) {
    const cached = readCache();
    if (cached) {
      return { records: cached.records, source: 'cache', cachedAt: cached.cachedAt };
    }
  }

  const response = await fetch(TSV_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch TSV: ${response.status}`);
  }

  const text = await response.text();
  const records = parseTsv(text);
  persistCache(text);

  return { records, source: 'network', cachedAt: Date.now() };
}

function parseTsv(text: string): ReportRecord[] {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((row) => row.trim().length > 0);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].split('\t').map((header) => normalize(header));
  const records: ReportRecord[] = [];

  for (const row of rows.slice(1)) {
    const cells = row.split('\t');
    const data: Record<string, string> = {};

    headers.forEach((header, index) => {
      const key = resolveHeaderKey(header);
      data[key] = (cells[index] ?? '').trim();
    });

    const youtubeUrl = data.youtubeUrl ?? '';
    const youtubeId = extractYoutubeId(youtubeUrl);
    const record: ReportRecord = {
      date: data.date ?? '',
      room: data.room ?? '',
      speaker: data.speaker ?? '',
      reportVi: data.reportVi ?? '',
      reportEn: data.reportEn ?? '',
      youtubeUrl,
      slidesUrl: data.slidesUrl ?? '',
      youtubeId,
      searchBlob: [data.date, data.room, data.speaker, data.reportVi, data.reportEn, youtubeUrl, data.slidesUrl]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };

    if (record.date || record.reportVi || record.youtubeUrl) {
      records.push(record);
    }
  }

  return records;
}

function extractYoutubeId(url: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    const videoId = parsed.searchParams.get('v');
    if (videoId) {
      return videoId;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }
  } catch {
    const match = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
    return match?.[1] ?? null;
  }

  return null;
}

function persistCache(text: string): void {
  localStorage.setItem(CACHE_KEY, text);
  localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
}

function readCache(): { records: ReportRecord[]; cachedAt: number | null } | null {
  const text = localStorage.getItem(CACHE_KEY);
  if (!text) {
    return null;
  }

  return {
    records: parseTsv(text),
    cachedAt: Number(localStorage.getItem(CACHE_TIME_KEY) ?? '') || null,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveHeaderKey(header: string): string {
  if (headerMap[header]) {
    return headerMap[header];
  }

  if (header.includes('link youtube') || header.includes('youtube')) {
    return 'youtubeUrl';
  }

  if (header.includes('link bài báo cáo') || header.includes('slide')) {
    return 'slidesUrl';
  }

  if (header.includes('ngày')) {
    return 'date';
  }

  if (header.includes('phòng')) {
    return 'room';
  }

  if (header.includes('họ và tên')) {
    return 'speaker';
  }

  if (header.includes('báo cáo (tv)')) {
    return 'reportVi';
  }

  if (header.includes('báo cáo (ta)')) {
    return 'reportEn';
  }

  return header;
}
