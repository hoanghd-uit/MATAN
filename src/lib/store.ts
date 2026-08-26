import { create } from 'zustand';
import type { SessionStore, TelemetryRow, GameplayMedia, Dimension, GamingSpaceMedia } from '@/types';
import { buildTimelineEvents } from '@/lib/timeline';

// TODO: uncomment this for future uncomment
// const DEFAULT_DIMENSIONS: Dimension[] = [
//   { name: 'Emotion', min: -1, max: 1, step: 0.1, traceType: 'GTrace' }
// ];
const DEFAULT_DIMENSIONS: Dimension[] = [
  { name: 'Valence', min: -1, max: 1, step: 0.1, traceType: 'GTrace' },
  { name: 'Arousal', min: -1, max: 1, step: 0.1, traceType: 'GTrace' },
];

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Upload state
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
    const { telemetryData, dimensions, guidedLabelRawData, guidedLabelHeaders } = get();
    const events = buildTimelineEvents(telemetryData);
    const duration = events.length > 0 ? events[events.length - 1].relativeTime : 0;

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
    const { audioUrl, gameplayMedia, gamingSpaceMedia } = get();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (gameplayMedia) gameplayMedia.urls.forEach(u => URL.revokeObjectURL(u));
    if (gamingSpaceMedia && gamingSpaceMedia.url) URL.revokeObjectURL(gamingSpaceMedia.url);
    set({
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
