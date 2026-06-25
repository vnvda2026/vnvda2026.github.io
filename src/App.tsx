import { useEffect, useMemo, useRef, useState } from 'react';
import { loadReports } from './tsv';
import { readProgress, writeProgress } from './storage';
import { loadYoutubeApi } from './youtube';
import { addTag, loadSettings, normalizeTag, removeTag, saveSettings, type AppSettings, type SearchMode } from './settings';
import type { PersistedProgress, ReportRecord, ReportStatus } from './types';

type PlayerState = {
  ready: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
};

type YouTubePlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

const CACHE_FRESHNESS_HOURS = 24 * 30;
const SEARCH_STORAGE_KEY = 'conference-talks.search-v1';
const TAG_FILTER_STORAGE_KEY = 'conference-talks.tag-filter-v1';
const SELECTED_STORAGE_KEY = 'conference-talks.selected-v1';
const VIDEO_URL_PARAM = 'video';

export default function App() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => localStorage.getItem(SEARCH_STORAGE_KEY) ?? '');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, PersistedProgress>>(() => readProgress());
  const [playerState, setPlayerState] = useState<PlayerState>({ ready: false, currentTime: 0, duration: 0, isPlaying: false });
  const [cacheSource, setCacheSource] = useState<'cache' | 'network' | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'actions' | 'tags' | 'about'>('actions');
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [mobileReportsOpen, setMobileReportsOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TAG_FILTER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [tagDraft, setTagDraft] = useState('');
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const videoMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const playerIntervalRef = useRef<number | null>(null);
  const progressRef = useRef(progressMap);
  const initialVideoKeyRef = useRef<string | null>(new URLSearchParams(window.location.search).get(VIDEO_URL_PARAM));

  useEffect(() => {
    loadReportsData(false);
  }, []);

  useEffect(() => {
    localStorage.setItem(SEARCH_STORAGE_KEY, query);
  }, [query]);

  useEffect(() => {
    writeProgress(progressMap);
  }, [progressMap]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(TAG_FILTER_STORAGE_KEY, JSON.stringify(selectedTags));
  }, [selectedTags]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)');

    function handleChange(event: MediaQueryListEvent) {
      setIsCompactLayout(event.matches);
      setMobileReportsOpen(!event.matches);
    }

    setIsCompactLayout(mediaQuery.matches);
    setMobileReportsOpen(!mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (videoMenuAnchorRef.current && !videoMenuAnchorRef.current.contains(target)) {
        setVideoMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    progressRef.current = progressMap;
  }, [progressMap]);

  useEffect(() => {
    if (!records.length) {
      return;
    }

    const persistedSelected = localStorage.getItem(SELECTED_STORAGE_KEY);
    const urlSelected = initialVideoKeyRef.current;
    const preferred =
      (urlSelected && records.find((record) => keyOf(record) === urlSelected || record.youtubeId === urlSelected)) ??
      (persistedSelected && records.find((record) => keyOf(record) === persistedSelected)) ??
      records.find((record) => progressMap[keyOf(record)]?.status === 'watching') ??
      records.find((record) => progressMap[keyOf(record)]?.status === 'completed') ??
      records[0];

    if (preferred && !selectedId) {
      setSelectedId(keyOf(preferred));
    }
  }, [records, progressMap, selectedId]);

  const selectedRecord = selectedId ? records.find((record) => keyOf(record) === selectedId) ?? null : null;

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    localStorage.setItem(SELECTED_STORAGE_KEY, selectedId);
  }, [selectedId]);

  useEffect(() => {
    const selected = selectedReport;
    if (!selected?.youtubeId || !playerHostRef.current) {
      return;
    }

    let cancelled = false;
    let destroyed = false;

    async function mountPlayer() {
      await loadYoutubeApi();
      if (cancelled || !window.YT?.Player || !playerHostRef.current) {
        return;
      }

      playerHostRef.current.innerHTML = '';
      if (playerIntervalRef.current) {
        window.clearInterval(playerIntervalRef.current);
      }
      const startSeconds = progressRef.current[selectedId ?? '']?.progressSeconds ?? 0;

      const player = new window.YT.Player(playerHostRef.current, {
        videoId: selected.youtubeId ?? undefined,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          start: Math.max(0, Math.floor(startSeconds)),
        },
        events: {
          onReady: () => {
            if (cancelled || destroyed) {
              return;
            }

            setPlayerState((state) => ({
              ...state,
              ready: true,
              currentTime: startSeconds,
              duration: 0,
            }));
          },
          onStateChange: (event: { data: number; target: YouTubePlayer }) => {
            const playing = event.data === 1;
            const paused = event.data === 2;
            const ended = event.data === 0;

            setPlayerState((state) => ({
              ...state,
              isPlaying: playing,
            }));

            if (playing) {
              updateStatus(selected, 'watching');
            }

            if (paused || ended) {
              syncProgress(selected, event.target);
            }

            if (ended) {
              updateStatus(selected, 'completed');
            }
          },
        },
      }) as unknown as YouTubePlayer;

      playerRef.current = player;
      playerIntervalRef.current = window.setInterval(() => {
        if (!playerRef.current) {
          return;
        }
        syncProgress(selected, playerRef.current);
      }, 5000);
    }

    mountPlayer();

    return () => {
      cancelled = true;
      destroyed = true;
      syncProgress(selected, playerRef.current ?? undefined);
      if (playerIntervalRef.current) {
        window.clearInterval(playerIntervalRef.current);
        playerIntervalRef.current = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayerState({ ready: false, currentTime: 0, duration: 0, isPlaying: false });
    };
  }, [selectedId, selectedRecord?.youtubeId]);

  const filteredRecords = useMemo(() => {
    const terms = query
      .split(',')
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    const results = records.filter((record) => {
      const status = progressMap[keyOf(record)]?.status ?? 'will-watch';
      if (settings.searchMode !== 'all' && status !== settings.searchMode) {
        return false;
      }

      if (selectedTags.length) {
        const searchBlob = record.searchBlob;
        const matchesSelectedTags = selectedTags.every((tag) => searchBlob.includes(tag.toLowerCase()));
        if (!matchesSelectedTags) {
          return false;
        }
      }

      if (!terms.length) {
        return true;
      }

      return terms.every((term) => {
        if (term.startsWith('speaker:')) {
          return record.speaker.toLowerCase().includes(term.slice(8).trim());
        }
        if (term.startsWith('room:')) {
          return record.room.toLowerCase().includes(term.slice(5).trim());
        }
        if (term.startsWith('title:')) {
          return [record.reportVi, record.reportEn].join(' ').toLowerCase().includes(term.slice(6).trim());
        }
        return record.searchBlob.includes(term);
      });
    });

    return results;
  }, [query, records, progressMap, selectedTags, settings.searchMode]);

  const selectedReport = selectedRecord ?? filteredRecords[0] ?? records[0] ?? null;
  const selectedKey = selectedReport ? keyOf(selectedReport) : null;
  const selectedProgress = selectedKey ? progressMap[selectedKey] : undefined;
  const isFresh = cachedAt ? Date.now() - cachedAt < CACHE_FRESHNESS_HOURS * 60 * 60 * 1000 : false;

  async function loadReportsData(forceReload: boolean) {
    try {
      setError(null);
      setRefreshing(forceReload);
      setLoading(!records.length);
      const result = await loadReports(forceReload);
      setRecords(sortRecords(result.records));
      setCacheSource(result.source);
      setCachedAt(result.cachedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách báo cáo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function selectReport(record: ReportRecord) {
    setSelectedId(keyOf(record));
    updateStatus(record, progressMap[keyOf(record)]?.status ?? 'watching');
    if (isCompactLayout) {
      setMobileReportsOpen(false);
    }
    setVideoMenuOpen(false);
    setStatusMenuOpen(false);
  }

  function focusSearch() {
    setMobileReportsOpen(true);
    searchInputRef.current?.focus({ preventScroll: true });
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
  }

  function setSearchMode(mode: SearchMode) {
    updateSettings({ ...settings, searchMode: mode });
  }

  function addCustomTag(tag: string) {
    const nextTag = normalizeTag(tag);
    if (!nextTag) {
      return;
    }

    updateSettings({
      ...settings,
      tags: addTag(settings.tags, nextTag),
    });
    setTagDraft('');
  }

  function deleteCustomTag(tag: string) {
    updateSettings({
      ...settings,
      tags: removeTag(settings.tags, tag),
    });
  }

  function updateStatus(record: ReportRecord, status: ReportStatus) {
    const key = keyOf(record);
    setProgressMap((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          progressSeconds: 0,
          updatedAt: Date.now(),
          title: record.reportVi,
        }),
        status,
        updatedAt: Date.now(),
      },
    }));
  }

  function syncProgress(record: ReportRecord, player?: YouTubePlayer) {
    const key = keyOf(record);
    const currentTime = player?.getCurrentTime?.() ?? playerState.currentTime;
    const duration = player?.getDuration?.() ?? playerState.duration;
    const watchedEnough = duration > 0 && currentTime >= duration * 0.9;

    setProgressMap((current) => ({
      ...current,
      [key]: {
        status: watchedEnough ? 'completed' : current[key]?.status === 'completed' ? 'completed' : current[key]?.status ?? 'watching',
        progressSeconds: watchedEnough ? duration : Math.max(0, currentTime),
        updatedAt: Date.now(),
        title: record.reportVi,
      },
    }));

    setPlayerState((current) => ({
      ...current,
      currentTime: Math.max(0, currentTime),
      duration: Math.max(current.duration, duration),
    }));
  }

  function handleReload() {
    void loadReportsData(true);
  }

  async function copyVideoLink() {
    if (!selectedReport) {
      return;
    }

    const current = new URL(window.location.href);
    const videoId = selectedReport.youtubeId ?? selectedId ?? '';
    if (videoId) {
      current.searchParams.set(VIDEO_URL_PARAM, videoId);
    }
    const shareUrl = `${current.pathname}${current.search}${current.hash}`;

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
    } catch {
      window.prompt('Sao chép link video', `${window.location.origin}${shareUrl}`);
    }
  }

  function openSettings(tab: 'actions' | 'tags' | 'about' = 'actions') {
    setSettingsTab(tab);
    setSettingsOpen(true);
    setVideoMenuOpen(false);
    setStatusMenuOpen(false);
  }

  function toggleVideoMenu() {
    setVideoMenuOpen((current) => !current);
    setSettingsOpen(false);
    setStatusMenuOpen(false);
  }

  function toggleStatusMenu() {
    setStatusMenuOpen((current) => !current);
    setVideoMenuOpen(false);
    setSettingsOpen(false);
  }

  function toggleTagFilter(tag: string) {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return;
    }

    setSelectedTags((current) =>
      current.some((item) => item.toLowerCase() === normalized.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
        : [...current, normalized],
    );
  }

  function manualStatusChange(status: ReportStatus) {
    if (!selectedReport) {
      return;
    }
    updateStatus(selectedReport, status);
  }

  const summary = useMemo(() => {
    const watched = records.filter((record) => progressMap[keyOf(record)]?.status === 'completed').length;
    const watching = records.filter((record) => progressMap[keyOf(record)]?.status === 'watching').length;
    return { watched, watching, total: records.length };
  }, [records, progressMap]);

  useEffect(() => {
    if (!selectedReport) {
      return;
    }

    playerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    const nextVideo = selectedReport.youtubeId ?? selectedId ?? '';
    const current = new URL(window.location.href);
    if (nextVideo) {
      current.searchParams.set(VIDEO_URL_PARAM, nextVideo);
    } else {
      current.searchParams.delete(VIDEO_URL_PARAM);
    }

    window.history.replaceState(null, '', `${current.pathname}${current.search}${current.hash}`);
    initialVideoKeyRef.current = nextVideo || null;
  }, [selectedReport, selectedId]);

  return (
    <div className="app-shell">
      <div className="app-background" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Hội nghị khoa học thường niên toàn quốc</p>
          <h2>Hội bệnh mạch máu Việt Nam 2026</h2>
        </div>
        <div className="topbar-actions">
          <div className="status-pills">
            <span>{summary.total} báo cáo</span>
            <span>{summary.watching} đang xem</span>
            <span>{summary.watched} đã xem xong</span>
          </div>
          <button className="icon-button" onClick={() => openSettings()} aria-label="Mở cài đặt">
            ⚙
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className={isCompactLayout ? 'sidebar sidebar--compact' : 'sidebar'}>
          <section className="panel search-panel">
            <label className="field-label" htmlFor="search">Tìm kiếm nâng cao</label>
            <div className="search-control-row">
              <input
                ref={searchInputRef}
                id="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setMobileReportsOpen(true)}
                className="search-input"
                placeholder="từ khóa ngăn cách bằng dấu phẩy. Ví dụ: hoài, lớn"
              />
              <button className="icon-button filter-trigger" onClick={toggleStatusMenu} aria-label="Mở bộ lọc trạng thái" aria-expanded={statusMenuOpen}>
                ...
              </button>
            </div>
            <div className="search-filter-row">
              <div className="tag-filter-pills">
                {settings.tags.length
                  ? settings.tags.map((tag) => (
                      <button
                        key={tag}
                        className={selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase()) ? 'tag tag-filter active' : 'tag tag-filter'}
                        onClick={() => toggleTagFilter(tag)}
                      >
                        {tag}
                      </button>
                    ))
                  : null}
              </div>
            </div>
            {statusMenuOpen ? (
              <div className="status-dropdown" role="menu" aria-label="Chọn trạng thái">
                {([
                  ['all', 'Tất cả'],
                  ['will-watch', 'Sẽ xem'],
                  ['watching', 'Đang xem'],
                  ['completed', 'Đã xem xong'],
                ] as Array<[SearchMode, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    className={settings.searchMode === value ? 'mode-chip active' : 'mode-chip'}
                    onClick={() => {
                      setSearchMode(value);
                      setStatusMenuOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel list-panel">
            <div className="list-header">
              <div>
                <h2>Danh sách báo cáo</h2>
                <p>{filteredRecords.length} kết quả</p>
              </div>
              <div className="list-header__actions">
                {isCompactLayout ? (
                  <button
                    className="ghost-button flat list-collapse-button icon-button"
                    onClick={() => setMobileReportsOpen((current) => !current)}
                    aria-expanded={mobileReportsOpen}
                    aria-controls="report-list"
                    aria-label={mobileReportsOpen ? 'Thu gọn danh sách báo cáo' : 'Mở danh sách báo cáo'}
                  >
                    {mobileReportsOpen ? '▾' : '▸'}
                  </button>
                ) : null}
                <button className="icon-button" onClick={handleReload} aria-label="Tải lại TSV" disabled={refreshing}>
                  ↻
                </button>
              </div>
            </div>

            <div id="report-list" className={mobileReportsOpen ? 'report-list' : 'report-list report-list--collapsed'}>
              {loading ? (
                <div className="empty-state">Đang tải dữ liệu TSV…</div>
              ) : error ? (
                <div className="empty-state error">{error}</div>
              ) : filteredRecords.length === 0 ? (
                <div className="empty-state">Không có kết quả phù hợp.</div>
              ) : (
                filteredRecords.map((record) => {
                  const key = keyOf(record);
                  const progress = progressMap[key];
                  const status = progress?.status ?? 'will-watch';
                  return (
                    <button
                      key={key}
                      className={key === selectedKey ? 'report-item active' : 'report-item'}
                      onClick={() => selectReport(record)}
                    >
                      <div className="report-item-top">
                        <span className="report-date">{record.date || '---'}</span>
                        <span className={`tag status-${status}`}>{statusLabel(status)}</span>
                      </div>
                      <strong>{record.reportVi || record.reportEn || 'Không có tiêu đề'}</strong>
                      <p>{record.speaker || 'Chưa có tên tác giả'} · {record.room || 'Chưa có phòng'}</p>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        <section className="content panel">
          {selectedReport ? (
            <>
              <div className="content-header">
                <div>
                  <p className="eyebrow">{selectedReport.date || 'Chưa có ngày'} · {selectedReport.room || 'Chưa có phòng'} - <b>{selectedReport.speaker}</b></p>
                  <h2>{selectedReport.reportVi || selectedReport.reportEn}</h2>
                  <p className="subtitle compact">{selectedReport.reportEn || 'Bài báo cáo chưa có tên tiếng Anh'}</p>
                </div>
                <div className="content-actions content-actions--anchor" ref={videoMenuAnchorRef}>
                  <span className={`tag status-${selectedProgress?.status ?? 'will-watch'}`}>{statusLabel(selectedProgress?.status ?? 'will-watch')}</span>
                  <button className="icon-button" onClick={focusSearch} aria-label="Mở tìm kiếm nâng cao">
                    🔎
                  </button>
                  <button className="icon-button" onClick={toggleVideoMenu} aria-label="Mở cài đặt video" aria-expanded={videoMenuOpen}>
                    ⚙
                  </button>

                  {videoMenuOpen ? (
                    <div className="video-menu" role="menu" aria-label="Menu video">
                      <div className="video-menu__section">
                        <p className="settings-title">Chế độ video</p>
                        <div className="video-menu__actions">
                          {(['will-watch', 'watching', 'completed'] as ReportStatus[]).map((status) => (
                            <button
                              key={status}
                              className={selectedProgress?.status === status ? 'mini-button active' : 'mini-button'}
                              onClick={() => {
                                manualStatusChange(status);
                                setVideoMenuOpen(false);
                              }}
                              disabled={!selectedReport}
                            >
                              {statusLabel(status)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="video-menu__section">
                        <p className="settings-title">Chia sẻ</p>
                        <button className="ghost-button flat video-menu__share" onClick={copyVideoLink} disabled={!selectedReport?.youtubeUrl}>
                          <span className="video-menu__share-icon" aria-hidden="true">⧉</span>
                          Copy link video
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="player-card" ref={playerCardRef}>
                <div className="video-frame">
                  {selectedReport.youtubeId ? (
                    <div className="youtube-host" ref={playerHostRef} />
                  ) : (
                    <div className="empty-state">Không có link YouTube hợp lệ.</div>
                  )}
                </div>
                <div className="player-meta">
                  <div>
                    <p className="field-label">Tiến độ xem</p>
                    <strong>
                      {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
                    </strong>
                  </div>
                  <div>
                    <p className="field-label">Slide trình bày</p>
                    <a className="slide-link" href={selectedReport.slidesUrl} target="_blank" rel="noreferrer">
                      Mở / tải slide báo cáo
                    </a>
                  </div>
                  <div>
                    <p className="field-label">Nguồn YouTube</p>
                    <a className="slide-link" href={selectedReport.youtubeUrl} target="_blank" rel="noreferrer">
                      Mở video gốc
                    </a>
                  </div>
                </div>
              </div>

              <div className="details-grid">
                <article className="detail-card">
                  <h3>Báo cáo viên</h3>
                  <p>{selectedReport.speaker || 'Chưa có thông tin'}</p>
                </article>
                <article className="detail-card">
                  <h3>Tên báo cáo</h3>
                  <p>{selectedReport.reportVi || 'Chưa có thông tin'}</p>
                </article>
                <article className="detail-card">
                  <h3>Report</h3>
                  <p>{selectedReport.reportEn || 'Chưa có thông tin'}</p>
                </article>
                <article className="detail-card">
                  <h3>Ghi chú đồng bộ</h3>
                  <p>
                    {selectedProgress
                      ? `Đã lưu cục bộ lúc ${new Date(selectedProgress.updatedAt).toLocaleString('vi-VN')}`
                      : 'Chưa có dữ liệu xem lại.'}
                  </p>
                </article>
              </div>
            </>
          ) : (
            <div className="empty-state large">Chưa chọn bài báo cáo nào.</div>
          )}
        </section>
      </main>

      {settingsOpen ? (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-dialog" role="dialog" aria-modal="true" aria-label="Cài đặt" onClick={(event) => event.stopPropagation()}>
            <div className="settings-dialog__header">
              <div>
                <p className="field-label">Cài đặt</p>
                <h3>Chỉnh trạng thái, tags, thao tác nhanh và thông tin tác giả</h3>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Đóng cài đặt">
                ×
              </button>
            </div>

            <div className="settings-tabs" role="tablist" aria-label="Cài đặt">
              <button className={settingsTab === 'actions' ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab('actions')} role="tab" aria-selected={settingsTab === 'actions'}>
                Thao tác
              </button>
              <button className={settingsTab === 'tags' ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab('tags')} role="tab" aria-selected={settingsTab === 'tags'}>
                Tags
              </button>
              <button className={settingsTab === 'about' ? 'settings-tab active' : 'settings-tab'} onClick={() => setSettingsTab('about')} role="tab" aria-selected={settingsTab === 'about'}>
                Giới thiệu
              </button>
            </div>

            <div className="settings-panel" role="tabpanel">
              {settingsTab === 'actions' ? (
                <>
                  <div className="settings-section">
                    <div className="settings-row">
                      <p className="settings-title">Tải dữ liệu</p>
                      <button className="ghost-button flat" onClick={handleReload} disabled={refreshing}>
                        {refreshing ? 'Đang tải lại…' : 'Reload TSV'}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {settingsTab === 'tags' ? (
                <div className="settings-section settings-section--first">
                  <p className="settings-title">Tags</p>
                  <div className="settings-row tag-editor">
                    <input
                      className="search-input compact"
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      placeholder="Thêm tag mới"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addCustomTag(tagDraft);
                        }
                      }}
                    />
                    <button className="ghost-button flat" onClick={() => addCustomTag(tagDraft)}>
                      Thêm
                    </button>
                  </div>
                  <div className="tag-list">
                    {settings.tags.length ? (
                      settings.tags.map((tag) => (
                        <span key={tag} className="tag tag-editable">
                          {tag}
                          <button className="tag-remove" onClick={() => deleteCustomTag(tag)} aria-label={`Xóa tag ${tag}`}>
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <p className="hint">Chưa có tag nào.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {settingsTab === 'about' ? (
                <div className="settings-section settings-section--first">
                  <p className="settings-title">Tác giả</p>
                  <div className="about-card">
                    <strong>Ban IT, Ban thư ký hội</strong>
                    <p>Trang web này được xây dựng và vận hành bởi Ban IT phối hợp với Ban thư ký hội.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  function statusLabel(status: ReportStatus) {
    switch (status) {
      case 'watching':
        return 'Đang xem';
      case 'completed':
        return 'Đã xem xong';
      default:
        return 'Sẽ xem';
    }
  }

  function keyOf(record: ReportRecord) {
    return `${record.date}|${record.speaker}|${record.reportVi}|${record.youtubeId ?? record.youtubeUrl}`;
  }

  function sortRecords(nextRecords: ReportRecord[]) {
    return [...nextRecords].sort((left, right) => getRecordSortValue(left) - getRecordSortValue(right));
  }

  function getRecordSortValue(record: ReportRecord) {
    const parsed = parseRecordDateTime(record.date);
    return parsed ?? Number.MAX_SAFE_INTEGER;
  }

  function parseRecordDateTime(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const iso = Date.parse(normalized);
    if (!Number.isNaN(iso)) {
      return iso;
    }

    const directMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (directMatch) {
      const [, day, month, yearPart, hourPart = '0', minutePart = '0'] = directMatch;
      const year = yearPart.length === 2 ? Number(`20${yearPart}`) : Number(yearPart);
      const parsed = new Date(year, Number(month) - 1, Number(day), Number(hourPart), Number(minutePart), 0, 0).getTime();
      return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  function formatTime(seconds: number) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }
}
