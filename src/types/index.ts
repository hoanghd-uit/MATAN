// === Types ===

export interface TimelineEvent {
  /** Relative time in seconds from session start (00:00) */
  relativeTime: number;
  /** Index in the parsed CSV data array */
  rowIndex: number;
  /** Original unix timestamp from CSV */
  rawTimestamp: number;
}

export interface TelemetryRow {
  [key: string]: string;
}

export interface GameplayMedia {
  type: 'video' | 'images';
  files: File[];
  urls: string[]; // object URLs for preview
}

export interface GamingSpaceMedia {
  file: File;
  url: string; // object URL for preview
  skipOffset: number; // in seconds
}

export type ModalityType = 'video' | 'images' | 'audio' | 'telemetry';

export interface ModalityCell {
  id: string;
  name: string;
  type: ModalityType | null;
  files: File[];
  urls: string[];
  skipOffset: number; // in seconds
  telemetryHeaders?: string[];
  telemetryData?: TelemetryRow[];
  telemetryFileName?: string;
}

export type ExecutionMode = 'single_pass' | 'gated_multi_pass';

export type SessionState = 'upload' | 'active' | 'completed';

export type TraceType = 'GTrace' | 'RankTrace' | 'BTrace';

export interface Dimension {
  name: string;
  min: number; // integer, can be negative
  max: number; // integer
  step: number; // max 2 decimal places, e.g. 0.01
  traceType?: TraceType;
}

export interface SessionStore {
  // Generic Modality Cells (Responsive Modal Adapter)
  modalities: ModalityCell[];
  executionMode: ExecutionMode;

  // Upload state (maintained for backwards compatibility)
  gameplayMedia: GameplayMedia | null;
  gamingSpaceMedia: GamingSpaceMedia | null;

  telemetryData: TelemetryRow[];
  telemetryHeaders: string[];
  telemetryFileName: string;
  audioFile: File | null;
  audioUrl: string | null;
  annotatorId: string;
  dataSampleId: string;

  // Guided Label state (Optional)
  guidedLabelFile: File | null;
  guidedLabelFileName: string;
  guidedLabelHeaders: string[];
  guidedLabelRawData: Record<string, string>[];
  guidedRatings: Record<string, number[]>; // maps dimension name to guided rating array aligned with timelineEvents

  // Rating config (N-Dimensions)
  dimensions: Dimension[];
  activeDimensionIndex: number;

  // Session state
  sessionState: SessionState;
  timelineEvents: TimelineEvent[];
  currentEventIndex: number;
  ratings: Record<string, number[]>; // maps dimension name to its rating array
  totalDuration: number; // in seconds
  isPlaying: boolean;
  visitedEvents: Record<string, Set<number>>; // maps dimension name to visited indices

  // Actions
  setModalities: (modalities: ModalityCell[]) => void;
  addModalityCell: () => void;
  removeModalityCell: (id: string) => void;
  updateModalityCell: (id: string, updates: Partial<ModalityCell>) => void;
  setExecutionMode: (mode: ExecutionMode) => void;

  setGameplayMedia: (media: GameplayMedia) => void;
  setGamingSpaceMedia: (media: GamingSpaceMedia | null) => void;
  updateGamingSpaceSkipOffset: (offset: number) => void;
  setTelemetryData: (headers: string[], data: TelemetryRow[], fileName: string) => void;
  setGuidedLabelData: (file: File | null, headers: string[], rawData: Record<string, string>[], fileName: string) => void;
  clearGuidedLabel: () => void;
  setAudioFile: (file: File) => void;
  setDimensions: (dims: Dimension[]) => void;
  setActiveDimensionIndex: (idx: number) => void;
  setAnnotatorId: (id: string) => void;
  setDataSampleId: (id: string) => void;
  startSession: () => void;
  nextEvent: () => void;
  prevEvent: () => void;
  seekToEvent: (index: number) => void;
  autoplaySeekToEvent: (index: number) => void;
  rateUp: () => void;
  rateDown: () => void;
  setPlaying: (playing: boolean) => void;
  submitSession: () => void;
  reset: () => void;
}
