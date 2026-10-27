import { create } from 'zustand';
import type { SessionStore, TelemetryRow, GameplayMedia, Dimension, GamingSpaceMedia, ModalityCell, ExecutionMode, TimelineEvent } from '@/types';
import { buildTimelineEvents, parseImageFilenameToTime } from '@/lib/timeline';

// TODO: uncomment this for future uncomment
// const DEFAULT_DIMENSIONS: Dimension[] = [
//   { name: 'Emotion', min: -1, max: 1, step: 0.1, traceType: 'GTrace' }
// ];
const DEFAULT_DIMENSIONS: Dimension[] = [
  { name: 'Valence', min: -1, max: 1, step: 0.1, traceType: 'GTrace' },
  { name: 'Arousal', min: -1, max: 1, step: 0.1, traceType: 'GTrace' },
];

export const createDefaultModalities = (): ModalityCell[] => [
  { id: 'mod-1', name: '', type: null, files: [], urls: [], skipOffset: 0 },
  { id: 'mod-2', name: '', type: null, files: [], urls: [], skipOffset: 0 },
  { id: 'mod-3', name: '', type: null, files: [], urls: [], skipOffset: 0 },
  { id: 'mod-4', name: '', type: null, files: [], urls: [], skipOffset: 0 },
];

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Generic Modality Cells (Responsive Modal Adapter)
  modalities: createDefaultModalities(),
  executionMode: 'gated_multi_pass',

  // Upload state (legacy references)
  gameplayMedia: null,
  gamingSpaceMedia: null,
  telemetryData: [],
  telemetryHeaders: [],
  telemetryFileName: '',
  audioFile: null,
  audioUrl: null,
  annotatorId: '',
  dataSampleId: '',

  // Guided Label state (Optional)
  guidedLabelFile: null,
  guidedLabelFileName: '',
  guidedLabelHeaders: [],
  guidedLabelRawData: [],
  guidedRatings: {},

  // Rating config (N-Dimensions)
  dimensions: DEFAULT_DIMENSIONS,
  activeDimensionIndex: 0,
  sessionState: 'upload',
  timelineEvents: [],
  currentEventIndex: 0,
  ratings: {},
  totalDuration: 0,
  isPlaying: false,
  visitedEvents: {},

  // Modality actions
  setModalities: (modalities: ModalityCell[]) => set({ modalities }),

  addModalityCell: () => {
    const current = get().modalities;
    const newCell: ModalityCell = {
      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      type: null,
      files: [],
      urls: [],
      skipOffset: 0,
    };
    set({ modalities: [...current, newCell] });
  },

  removeModalityCell: (id: string) => {
    const current = get().modalities;
    const target = current.find(m => m.id === id);
    if (target && target.urls) {
      target.urls.forEach(u => URL.revokeObjectURL(u));
    }
    set({ modalities: current.filter(m => m.id !== id) });
  },

  updateModalityCell: (id: string, updates: Partial<ModalityCell>) => {
    const current = get().modalities;
    const updated = current.map(m => (m.id === id ? { ...m, ...updates } : m));
    set({ modalities: updated });
  },

  setExecutionMode: (mode: ExecutionMode) => set({ executionMode: mode }),

  // Actions
  setGameplayMedia: (media: GameplayMedia) => set({ gameplayMedia: media }),

  setGamingSpaceMedia: (media: GamingSpaceMedia | null) => {
    const prev = get().gamingSpaceMedia;
    if (prev && prev.url) URL.revokeObjectURL(prev.url);
    set({ gamingSpaceMedia: media });
  },

  updateGamingSpaceSkipOffset: (offset: number) => {
    const current = get().gamingSpaceMedia;
    if (!current) return;
    set({ gamingSpaceMedia: { ...current, skipOffset: offset } });
  },

  setTelemetryData: (headers: string[], data: TelemetryRow[], fileName: string) =>
    set({ telemetryHeaders: headers, telemetryData: data, telemetryFileName: fileName }),

  setGuidedLabelData: (file: File | null, headers: string[], rawData: Record<string, string>[], fileName: string) =>
    set({
      guidedLabelFile: file,
      guidedLabelHeaders: headers,
      guidedLabelRawData: rawData,
      guidedLabelFileName: fileName,
    }),

  clearGuidedLabel: () =>
    set({
      guidedLabelFile: null,
      guidedLabelFileName: '',
      guidedLabelHeaders: [],
      guidedLabelRawData: [],
      guidedRatings: {},
    }),

  setAudioFile: (file: File) => {
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ audioFile: file, audioUrl: URL.createObjectURL(file) });
  },

  setDimensions: (dims: Dimension[]) => set({ dimensions: dims }),

  setActiveDimensionIndex: (idx: number) => set({ activeDimensionIndex: idx }),

  setAnnotatorId: (id: string) => set({ annotatorId: id }),

  setDataSampleId: (id: string) => set({ dataSampleId: id }),

  startSession: () => {
    const { telemetryData: rawTelemetry, modalities, dimensions, guidedLabelRawData, guidedLabelHeaders } = get();

    // Check if telemetry is in modalities
    let effectiveTelemetry = rawTelemetry;
    let effectiveTelemetryHeaders = get().telemetryHeaders;
    let effectiveTelemetryFileName = get().telemetryFileName;

    const telemCell = modalities.find(m => m.type === 'telemetry' && m.telemetryData && m.telemetryData.length > 0);
    if (telemCell && telemCell.telemetryData) {
      effectiveTelemetry = telemCell.telemetryData;
      effectiveTelemetryHeaders = telemCell.telemetryHeaders || [];
      effectiveTelemetryFileName = telemCell.telemetryFileName || telemCell.name || 'telemetry.csv';
    }

    let events: TimelineEvent[] = [];
    if (effectiveTelemetry.length > 0) {
      events = buildTimelineEvents(effectiveTelemetry);
    } else {
      // Fallback: check if there is an image modality
      const imgCell = modalities.find(m => m.type === 'images' && m.files.length > 0);
      if (imgCell) {
        events = imgCell.files.map((file, i) => {
          const t = parseImageFilenameToTime(file.name);
          return {
            relativeTime: t !== null ? t : i * 0.1,
            rowIndex: i,
            rawTimestamp: t !== null ? Math.round(t * 1000) : i * 100,
          };
        });
      } else {
        // Fallback for video or audio only
        const defaultDuration = 60;
        const step = 0.5;
        const count = Math.max(10, Math.floor(defaultDuration / step));
        events = Array.from({ length: count }, (_, i) => ({
          relativeTime: i * step,
          rowIndex: i,
          rawTimestamp: i * Math.round(step * 1000),
        }));
      }
    }

    const duration = events.length > 0 ? events[events.length - 1].relativeTime : 0;

    // Sync legacy media variables if needed
    const audioCell = modalities.find(m => m.type === 'audio' && m.files.length > 0);
    let effectiveAudioFile = get().audioFile;
    let effectiveAudioUrl = get().audioUrl;
    if (audioCell && audioCell.files.length > 0) {
      effectiveAudioFile = audioCell.files[0];
      effectiveAudioUrl = audioCell.urls[0] || (audioCell.files[0] ? URL.createObjectURL(audioCell.files[0]) : null);
    }

    const videoOrImgCells = modalities.filter(m => (m.type === 'video' || m.type === 'images') && m.files.length > 0);
    let effectiveGameplay = get().gameplayMedia;
    let effectiveGamingSpace = get().gamingSpaceMedia;
    if (videoOrImgCells.length > 0) {
      const first = videoOrImgCells[0];
      effectiveGameplay = {
        type: first.type === 'video' ? 'video' : 'images',
        files: first.files,
        urls: first.urls,
      };
      if (videoOrImgCells.length > 1) {
        const second = videoOrImgCells[1];
        if (second.type === 'video' && second.files.length > 0) {
          effectiveGamingSpace = {
            file: second.files[0],
            url: second.urls[0],
            skipOffset: second.skipOffset || 0,
          };
        }
      }
    }

    const initialRatings: Record<string, number[]> = {};
    const initialVisited: Record<string, Set<number>> = {};
    const initialGuidedRatings: Record<string, number[]> = {};

    // Prepare guided ratings if guided label data is provided
    let guidedMap: Map<number, Record<string, string>> | null = null;
    if (guidedLabelRawData.length > 0) {
      const tsCol =
        guidedLabelHeaders.find((h) => h.toLowerCase().includes('timestamp')) || '[control]timestamp_unix';
      guidedMap = new Map();
      guidedLabelRawData.forEach((row) => {
        const ts = parseInt(row[tsCol], 10);
        if (!isNaN(ts)) {
          guidedMap?.set(ts, row);
        }
      });
    }

    dimensions.forEach((d) => {
      initialRatings[d.name] = new Array(events.length).fill(0);
      initialVisited[d.name] = new Set([0]);

      if (guidedLabelRawData.length > 0) {
        initialGuidedRatings[d.name] = events.map((evt, idx) => {
          const row = guidedMap?.get(evt.rawTimestamp) || guidedLabelRawData[idx];
          if (row && row[d.name] !== undefined) {
            const val = parseFloat(row[d.name]);
            return isNaN(val) ? 0 : val;
          }
          return 0;
        });
      }
    });

    set({
      sessionState: 'active',
      timelineEvents: events,
      totalDuration: duration,
      currentEventIndex: 0,
      activeDimensionIndex: 0,
      ratings: initialRatings,
      guidedRatings: initialGuidedRatings,
      visitedEvents: initialVisited,
      isPlaying: false,
      telemetryData: effectiveTelemetry,
      telemetryHeaders: effectiveTelemetryHeaders,
      telemetryFileName: effectiveTelemetryFileName,
      audioFile: effectiveAudioFile,
      audioUrl: effectiveAudioUrl,
      gameplayMedia: effectiveGameplay,
      gamingSpaceMedia: effectiveGamingSpace,
    });
  },

  nextEvent: () => {
    const { currentEventIndex, timelineEvents, ratings, visitedEvents, dimensions, activeDimensionIndex } = get();
    if (currentEventIndex >= timelineEvents.length - 1) return;
    const nextIdx = currentEventIndex + 1;
    const activeDimName = dimensions[activeDimensionIndex].name;

    const activeRatings = [...(ratings[activeDimName] || [])];
    const activeVisited = new Set(visitedEvents[activeDimName] || []);

    if (!activeVisited.has(nextIdx)) {
      activeRatings[nextIdx] = activeRatings[currentEventIndex] ?? 0;
    }
    activeVisited.add(nextIdx);

    set({
      currentEventIndex: nextIdx,
      ratings: {
        ...ratings,
        [activeDimName]: activeRatings
      },
      visitedEvents: {
        ...visitedEvents,
        [activeDimName]: activeVisited
      },
      isPlaying: false,
    });
  },

  prevEvent: () => {
    const { currentEventIndex } = get();
    if (currentEventIndex <= 0) return;
    set({ currentEventIndex: currentEventIndex - 1, isPlaying: false });
  },

  seekToEvent: (index: number) => {
    const { timelineEvents, ratings, currentEventIndex, visitedEvents, dimensions, activeDimensionIndex } = get();
    if (index < 0 || index >= timelineEvents.length) return;
    const activeDimName = dimensions[activeDimensionIndex].name;

    const activeRatings = [...(ratings[activeDimName] || [])];
    const activeVisited = new Set(visitedEvents[activeDimName] || []);

    if (!activeVisited.has(index)) {
      activeRatings[index] = activeRatings[currentEventIndex] ?? 0;
    }
    activeVisited.add(index);

    set({
      currentEventIndex: index,
      ratings: {
        ...ratings,
        [activeDimName]: activeRatings
      },
      visitedEvents: {
        ...visitedEvents,
        [activeDimName]: activeVisited
      },
      isPlaying: false,
    });
  },

  autoplaySeekToEvent: (index: number) => {
    const { timelineEvents, ratings, currentEventIndex, visitedEvents, dimensions, activeDimensionIndex } = get();
    if (index < 0 || index >= timelineEvents.length) return;
    const activeDimName = dimensions[activeDimensionIndex].name;

    const activeRatings = [...(ratings[activeDimName] || [])];
    const activeVisited = new Set(visitedEvents[activeDimName] || []);

    activeRatings[index] = activeRatings[currentEventIndex] ?? 0;
    activeVisited.add(index);

    set({
      currentEventIndex: index,
      ratings: {
        ...ratings,
        [activeDimName]: activeRatings
      },
      visitedEvents: {
        ...visitedEvents,
        [activeDimName]: activeVisited
      },
    });
  },

  rateUp: () => {
    const { currentEventIndex, ratings, dimensions, activeDimensionIndex } = get();
    const activeDim = dimensions[activeDimensionIndex];
    const activeDimName = activeDim.name;

    const activeRatings = [...(ratings[activeDimName] || [])];
    const newVal = Math.round(((activeRatings[currentEventIndex] ?? 0) + activeDim.step) * 100) / 100;
    activeRatings[currentEventIndex] = Math.min(activeDim.max, newVal);

    set({
      ratings: {
        ...ratings,
        [activeDimName]: activeRatings
      }
    });
  },

  rateDown: () => {
    const { currentEventIndex, ratings, dimensions, activeDimensionIndex } = get();
    const activeDim = dimensions[activeDimensionIndex];
    const activeDimName = activeDim.name;

    const activeRatings = [...(ratings[activeDimName] || [])];
    const newVal = Math.round(((activeRatings[currentEventIndex] ?? 0) - activeDim.step) * 100) / 100;
    activeRatings[currentEventIndex] = Math.max(activeDim.min, newVal);

    set({
      ratings: {
        ...ratings,
        [activeDimName]: activeRatings
      }
    });
  },

  setPlaying: (playing: boolean) => set({ isPlaying: playing }),

  submitSession: () => set({ sessionState: 'completed' }),

  reset: () => {
    const { audioUrl, gameplayMedia, gamingSpaceMedia, modalities } = get();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (gameplayMedia) gameplayMedia.urls.forEach(u => URL.revokeObjectURL(u));
    if (gamingSpaceMedia && gamingSpaceMedia.url) URL.revokeObjectURL(gamingSpaceMedia.url);
    modalities.forEach(m => {
      m.urls.forEach(u => URL.revokeObjectURL(u));
    });
    set({
      modalities: createDefaultModalities(),
      executionMode: 'gated_multi_pass',
      gameplayMedia: null,
      gamingSpaceMedia: null,
      telemetryData: [],
      telemetryHeaders: [],
      telemetryFileName: '',
      audioFile: null,
      audioUrl: null,
      annotatorId: '',
      dataSampleId: '',
      guidedLabelFile: null,
      guidedLabelFileName: '',
      guidedLabelHeaders: [],
      guidedLabelRawData: [],
      guidedRatings: {},
      dimensions: DEFAULT_DIMENSIONS,
      activeDimensionIndex: 0,
      sessionState: 'upload',
      timelineEvents: [],
      currentEventIndex: 0,
      ratings: {},
      totalDuration: 0,
      isPlaying: false,
      visitedEvents: {},
    });
  },
}));
