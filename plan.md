# 🎮 Annotation Session Labeling Tool — Implementation Plan

> **Mục tiêu**: Xây dựng web app cho phép researcher upload gameplay video/images, audio, và game telemetry log, sau đó đồng bộ timeline để labeling mood/emotion của player tại từng timestamp có sự kiện game.

---

## 📐 Architecture Overview

```
Next.js 15 (App Router)
├── Upload Page (4-grid layout)
│   ├── Block 1 (Top-Left): Gameplay video / image list
│   ├── Block 2 (Top-Right): Gaming Space — disabled (v2)
│   ├── Block 3 (Bottom-Left): CSV telemetry log
│   └── Block 4 (Bottom-Right): Audio file → soundwave
├── Session Page (after "Start Session")
│   ├── 4-grid hiển thị synced data tại current timestamp
│   ├── Timeline bar (derived from CSV timestamps)
│   ├── Navigation controls (prev/next event)
│   └── Labeling controls (mood up/down per timestamp)
└── State Management (React Context or Zustand)
```

---

## 📊 CSV Data Structure (Telemetry Log)

| Column | Example | Note |
|--------|---------|------|
| `[control]timestamp_unix` | `1785420126113` | Unix ms — sẽ normalize về `00:00` base |
| `[control]session_id` | `fc68685c-...` | Session identifier |
| `[string]device_type` | `System Product Name (ASUS)` | Device info |
| `player_health` | `800` | Player state |
| `player_is_firing` | `0` | Action flags |
| `active_weapon_name` | `Gun` | Current weapon |
| `boss_active` | `0` | Boss encounter |
| `score` | `0.000` | Game score |
| ... | ... | ~44 columns total |

---

## ✅ Task Checklist

### Phase 0: Project Setup
- [ ] Init Next.js 15 project (App Router, TypeScript, ESLint)
- [ ] Setup folder structure: `app/`, `components/`, `lib/`, `types/`, `hooks/`
- [ ] Install dependencies:
  - `wavesurfer.js` — audio waveform rendering
  - `papaparse` — CSV parsing in browser
  - `zustand` — lightweight state management
- [ ] Setup global CSS design system (dark theme, color palette, typography)
- [ ] Setup Google Fonts (Inter hoặc tương tự)

---

### Phase 1: Upload Page — 4-Grid Layout
- [ ] **Layout Component** (`components/UploadGrid.tsx`)
  - [ ] 2×2 CSS Grid, responsive
  - [ ] Mỗi block có trạng thái: `empty` (placeholder + icon), `loaded` (preview), `disabled`
  - [ ] Hover effects, subtle animations khi interact

- [ ] **Block 1 — Gameplay Media** (`components/blocks/GameplayBlock.tsx`)
  - [ ] Click → open Modal
  - [ ] Modal cho phép:
    - Upload 1 video file (`.mp4`, `.webm`, `.mov`)
    - HOẶC upload nhiều images (`.png`, `.jpg`, `.jpeg`, `.webp`)
  - [ ] Sau upload → hiển thị video thumbnail hoặc first image preview
  - [ ] Validate file extensions

- [ ] **Block 2 — Gaming Space (Disabled)** (`components/blocks/GamingSpaceBlock.tsx`)
  - [ ] Hiển thị placeholder với text: "🎮 Gaming Space — Coming in v2"
  - [ ] Visual disabled state (opacity, no hover, cursor not-allowed)
  - [ ] Không có interaction

- [ ] **Block 3 — Telemetry Log** (`components/blocks/TelemetryBlock.tsx`)
  - [ ] Click → file picker cho `.csv`
  - [ ] Parse CSV headers bằng PapaParse
  - [ ] Validate required columns (`[control]timestamp_unix` phải tồn tại)
  - [ ] Preview: hiển thị số rows, time range, vài sample columns
  - [ ] Store parsed data vào state

- [ ] **Block 4 — Audio Waveform** (`components/blocks/AudioBlock.tsx`)
  - [ ] Click → file picker cho `.mp3`, `.wav`, `.ogg`, `.m4a`
  - [ ] Render waveform preview bằng WaveSurfer.js (mini version)
  - [ ] Hiển thị duration info
  - [ ] Store audio blob/URL vào state

---

### Phase 2: Validation & Start Session
- [ ] **Validation Logic** (`lib/validation.ts`)
  - [ ] Check Block 1: có video hoặc ≥1 image
  - [ ] Check Block 3: CSV parsed thành công, có timestamp column
  - [ ] Check Block 4: audio file loaded
  - [ ] Block 2: skip (disabled)

- [ ] **Start Session Button**
  - [ ] Chỉ enable khi tất cả validation pass
  - [ ] Visual feedback: disabled state vs ready state (glow animation khi ready)
  - [ ] Click → transition sang Session view (slide timeline lên, ẩn button)

---

### Phase 3: Timeline & Sync Engine
- [ ] **Timeline Data Processing** (`lib/timeline.ts`)
  - [ ] Parse `[control]timestamp_unix` từ CSV
  - [ ] Normalize: lấy min timestamp làm `00:00`, convert tất cả thành relative offset (seconds)
  - [ ] Tạo array of `TimelineEvent { relativeTime: number, rowIndex: number, rawTimestamp: number }`
  - [ ] Calculate total duration

- [ ] **Timeline Bar Component** (`components/Timeline.tsx`)
  - [ ] Horizontal bar hiển thị full duration
  - [ ] Markers/ticks tại mỗi event timestamp
  - [ ] Current position indicator (highlight marker đang active)
  - [ ] Click-to-seek trên bar
  - [ ] Time display: `MM:SS` format

- [ ] **Navigation Controls** (`components/TimelineControls.tsx`)
  - [ ] 3 buttons: **Prev** (◀) | **Play/Pause** (▶/⏸) | **Next** (▶▶)
  - [ ] **Prev**: seek ngay tới timestamp event trước đó (video + audio + game log đồng bộ)
  - [ ] **Next**: seek ngay tới timestamp event tiếp theo
  - [ ] **Play/Pause**: play video + audio bình thường, **tự động dừng** khi tới next event timestamp
  - [ ] Khi auto-stop: update game log block, highlight timeline marker, chờ user action
  - [ ] Keyboard shortcuts: `←` / `→` for prev/next, `Space` for play/pause
  - [ ] Display current event index: `12 / 98`

- [ ] **Labeling Controls**
  - [ ] Rating scale: **-3 → 3** (integer), default `0`
  - [ ] **Up** button (▲): tăng rating +1 (max 3)
  - [ ] **Down** button (▼): giảm rating -1 (min -3)
  - [ ] Hiển thị rating hiện tại (số + visual indicator: color gradient từ đỏ → xanh)
  - [ ] **Carry-forward**: khi next frame, rating mặc định = rating của frame trước đó
  - [ ] Store ratings: `Map<number, number>` (eventIndex → rating -3..3)
  - [ ] Keyboard shortcuts: `↑` / `↓` for rating

---

### Phase 4: Session View — Synced Display
- [ ] **Gameplay Display** (Block 1 in session mode)
  - [ ] Nếu video: seek video tới `relativeTime` của current event
  - [ ] Nếu images: hiển thị image tại index tương ứng (map event index → image index)
  - [ ] Smooth transition giữa frames

- [ ] **Gaming Space** (Block 2 in session mode)
  - [ ] Vẫn disabled, giữ placeholder
  - [ ] (v2: sẽ hiển thị player face cam video synced)

- [ ] **Telemetry Display** (Block 3 in session mode)
  - [ ] Hiển thị JSON-formatted data của row tương ứng với current timestamp
  - [ ] Highlight các fields quan trọng (player_health, score, boss_active, etc.)
  - [ ] Key-value card layout, không raw JSON dump
  - [ ] Highlight thay đổi so với row trước (diff)

- [ ] **Audio Waveform** (Block 4 in session mode)
  - [ ] Full waveform rendering bằng WaveSurfer.js
  - [ ] Seek tới `relativeTime` khi navigate
  - [ ] Highlight vùng xung quanh current timestamp
  - [ ] Play/pause từ current position
  - [ ] Spectrogram view (optional, nếu WaveSurfer hỗ trợ)

---

### Phase 5: State Management & Data Flow
- [ ] **Session Store** (`lib/store.ts` — Zustand)
  - [ ] `gameplayMedia: { type: 'video' | 'images', files: File[] }`
  - [ ] `telemetryData: ParsedCSVRow[]`
  - [ ] `audioFile: File`
  - [ ] `timelineEvents: TimelineEvent[]`
  - [ ] `currentEventIndex: number`
  - [ ] `ratings: number[]` — array song song với timelineEvents, giá trị -3..3
  - [ ] `sessionState: 'upload' | 'active' | 'completed'`
  - [ ] Actions: `nextEvent()`, `prevEvent()`, `rateUp()`, `rateDown()`, `startSession()`, `submitSession()`, `reset()`
  - [ ] Carry-forward logic: `nextEvent()` → nếu frame mới chưa có rating, copy rating từ frame trước

- [ ] **Submit & Output** (`lib/export.ts`)
  - [ ] Khi user đã đi qua tất cả frames → hiện **Submit** button
  - [ ] Click Submit → modal loading hiển thị progress
  - [ ] Output: **CSV file** (tùy chọn export mode: "Export label only" hoặc "Append to CSV source" chứa cột `rating`)
  - [ ] Tên file output gợi ý:
    - Nếu chọn "Append to CSV source": `{original_filename}_{datasampleid}_{annotatorID}_labeled.csv`
    - Nếu chọn "Export label only": `label_{datasampleid}_{annotatorID}.csv`
  - [ ] Hỗ trợ thay đổi trực tiếp tên file output qua ô nhập text
  - [ ] Dùng PapaParse `unparse()` hoặc manual string build để giữ nguyên format gốc
  - [ ] Auto-download file sau khi generate xong
  - [ ] Session vẫn giữ nguyên (user có thể review lại, không reset)

---

### Phase 6: UI Polish & Design
- [ ] Dark theme toàn bộ app
- [ ] Glassmorphism cards cho 4 blocks
- [ ] Smooth page transition: Upload → Session mode
- [ ] Loading states cho file parsing
- [ ] Error toasts cho invalid files
- [ ] Responsive: hoạt động trên Desktop (chính), tablet (acceptable)
- [ ] Micro-animations: block hover, button press, timeline navigation
- [ ] Typography hierarchy rõ ràng

---

## 🗂️ Proposed Folder Structure

```
consent-violate-maxxing/
├── app/
│   ├── layout.tsx          # Root layout, fonts, metadata
│   ├── page.tsx            # Main page (upload + session)
│   └── globals.css         # Design system, theme tokens
├── components/
│   ├── UploadGrid.tsx      # 2x2 grid container
│   ├── blocks/
│   │   ├── GameplayBlock.tsx
│   │   ├── GamingSpaceBlock.tsx
│   │   ├── TelemetryBlock.tsx
│   │   └── AudioBlock.tsx
│   ├── Timeline.tsx        # Timeline bar
│   ├── TimelineControls.tsx # Nav + label buttons
│   ├── SessionView.tsx     # Session mode wrapper
│   └── ui/
│       ├── Modal.tsx
│       ├── Button.tsx
│       └── FileUploader.tsx
├── lib/
│   ├── store.ts            # Zustand store
│   ├── timeline.ts         # Timeline processing
│   ├── validation.ts       # File validation
│   └── csv-parser.ts       # CSV parsing wrapper
├── types/
│   └── index.ts            # TypeScript interfaces
├── hooks/
│   ├── useWaveSurfer.ts    # WaveSurfer hook
│   └── useKeyboard.ts     # Keyboard shortcuts
├── sample_data/            # (existing)
│   ├── TelemetryLog/
│   ├── ScreenRecording/
│   └── VoiceChat/
└── public/
```

---

## ⚠️ Open Questions (All Resolved ✅)

1. ~~**Image-to-timestamp mapping**~~: ✅ Priority image list. Filename format `{timestamp}.png` → match với game log timestamp. Nếu filename không có timestamp → fallback sequential: image[i] → event[i].
2. ~~**Label categories**~~: ✅ Rating scale -3 → 3, carry-forward từ frame trước.
3. ~~**Audio playback**~~: ✅ 3 controls: Prev | Play/Pause | Next. Play chạy bình thường và auto-stop tại next timestamp. Prev/Next seek ngay lập tức.
4. ~~**Data persistence**~~: ✅ Output là CSV file download, session giữ trong memory.
5. ~~**Video frame extraction**~~: ✅ Dùng `<video>` element + `.currentTime` seek trực tiếp (native approach).

---

## 🚀 Execution Order

```
Phase 0 → Phase 1 → Phase 2 → Phase 5 (store) → Phase 3 → Phase 4 → Phase 6
```

> Setup → Upload UI → Validation → State → Timeline → Sync → Polish
