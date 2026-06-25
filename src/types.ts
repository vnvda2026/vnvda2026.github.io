export type ReportStatus = 'will-watch' | 'watching' | 'completed';

export type ReportRecord = {
  date: string;
  room: string;
  speaker: string;
  reportVi: string;
  reportEn: string;
  youtubeUrl: string;
  slidesUrl: string;
  youtubeId: string | null;
  searchBlob: string;
};

export type PersistedProgress = {
  status: ReportStatus;
  progressSeconds: number;
  updatedAt: number;
  title: string;
};
