---
goal: Conference Talks Mini App
version: 1.0
date_created: 2026-06-24
last_updated: 2026-06-24
owner: GitHub Copilot
status: 'Completed'
tags: [feature, frontend, cache, youtube, tsv]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Build a fast, modern mini app that loads conference report data from a published TSV feed, caches it locally on first load, supports forced reload, provides comma-separated advanced search, and resumes YouTube playback from the last watched position.

## 1. Requirements & Constraints

- **REQ-001**: Load conference report data from the published TSV URL.
- **REQ-002**: Cache the fetched TSV locally after first successful load.
- **REQ-003**: Provide a Reload action that bypasses local cache and refreshes TSV from the source.
- **REQ-004**: Render a left sidebar list of reports with search and local status tags.
- **REQ-005**: Render a right-side detail panel with title, YouTube embed, and slide download link.
- **REQ-006**: Persist selected video progress locally and resume playback on return visits.
- **REQ-007**: Support comma-separated multi-keyword search and field hints for speaker, room, and title.
- **CON-001**: Keep the implementation lightweight and dependency-minimal.
- **CON-002**: Prioritize speed and ease of use over feature breadth.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Scaffold the app and document the intended behavior.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Create Vite + React + TypeScript project skeleton | ✅ | 2026-06-24 |
| TASK-002 | Add project documentation and run instructions | ✅ | 2026-06-24 |
| TASK-003 | Define the reporting data model and persistence keys | ✅ | 2026-06-24 |

### Implementation Phase 2

- GOAL-002: Implement the data flow, UI, and playback resume behavior.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | Parse TSV rows into normalized report records | ✅ | 2026-06-24 |
| TASK-005 | Cache TSV text locally and support force reload | ✅ | 2026-06-24 |
| TASK-006 | Build sidebar search, status filters, and selected report layout | ✅ | 2026-06-24 |
| TASK-007 | Embed YouTube player with playback progress persistence | ✅ | 2026-06-24 |
| TASK-008 | Validate production build successfully | ✅ | 2026-06-24 |

## 3. Alternatives

- **ALT-001**: Use IndexedDB instead of localStorage for cache persistence. Rejected because the TSV is expected to remain small and localStorage is simpler and faster to wire.
- **ALT-002**: Add a backend fetch proxy. Rejected because the source TSV is publicly accessible and the app can read it directly from the browser.

## 4. Dependencies

- **DEP-001**: React 19 for UI rendering.
- **DEP-002**: Vite for fast local development and production bundling.
- **DEP-003**: YouTube iframe API for playback control and resume behavior.

## 5. Files

- **FILE-001**: `package.json` for scripts and dependencies.
- **FILE-002**: `vite.config.ts` for build configuration.
- **FILE-003**: `src/App.tsx` for application UI and state management.
- **FILE-004**: `src/tsv.ts` for TSV fetching, parsing, and caching.
- **FILE-005**: `src/storage.ts` for local progress persistence.
- **FILE-006**: `src/youtube.ts` for API loading.
- **FILE-007**: `src/styles.css` for the visual design system.

## 6. Testing

- **TEST-001**: Build the project with `npm run build` and confirm a successful production bundle.
- **TEST-002**: Verify that TSV data persists after reload and that the app uses cached data on revisit.
- **TEST-003**: Verify that search filters the sidebar using comma-separated keywords.
- **TEST-004**: Verify that playback progress resumes from the previously stored position.

## 7. Risks & Assumptions

- **RISK-001**: YouTube iframe API availability is required at runtime for playback resume.
- **RISK-002**: If the published TSV structure changes, parsing may need to be updated.
- **ASSUMPTION-001**: The TSV remains small enough for localStorage-based caching.
- **ASSUMPTION-002**: Slide URLs and YouTube URLs are present for most rows.

## 8. Related Specifications / Further Reading

- [README](../README.md)
