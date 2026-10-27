'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useSessionStore } from '@/lib/store';
import { formatTime, parseImageFilenameToTime } from '@/lib/timeline';
import { exportLabeledCSV } from '@/lib/export';
import ScoreGraph from './ScoreGraph';
import styles from './SessionView.module.css';

// Dynamic import for WaveSurfer (client only)
import WaveSurfer from 'wavesurfer.js';

/** Interpolate rating color: negative=red, zero=neutral gray, positive=green */
function getRatingColor(value: number, min: number, max: number): string {
  // If min/max are float limits (RankTrace), map them to a dynamic range for color visualization
  let effMin = min;
  let effMax = max;
  if (min <= -1e10) {
    effMin = -5;
  }
  if (max >= 1e10) {
    effMax = 5;
  }
  if (value > effMax) effMax = value;
  if (value < effMin) effMin = value;

  if (value === 0) return 'var(--rate-0)';
  if (value > 0) {
    const t = effMax > 0 ? Math.min(value / effMax, 1) : 0;
    // Interpolate from mild green to strong green
    const h = 130;
    const s = 40 + t * 40; // 40% -> 80%
    const l = 65 - t * 20; // 65% -> 45%
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  const t = effMin < 0 ? Math.min(Math.abs(value) / Math.abs(effMin), 1) : 0;
  // Interpolate from mild red to strong red
  const h = 0;
  const s = 50 + t * 40; // 50% -> 90%
  const l = 65 - t * 15; // 65% -> 50%
  return `hsl(${h}, ${s}%, ${l}%)`;
}



type AudioPadMode = 'exact' | 'padded';
type PlayMode = 'step' | 'autoplay';

export default function SessionView() {
  const {
    gameplayMedia,
    gamingSpaceMedia,
    telemetryData,
    telemetryHeaders,
    telemetryFileName,
    audioUrl,
    timelineEvents,
    currentEventIndex,
    ratings,
    totalDuration,
    isPlaying,
    visitedEvents,
    nextEvent,
    prevEvent,
    seekToEvent,
    autoplaySeekToEvent,
    rateUp,
    rateDown,
    setPlaying,
    submitSession,
    sessionState,
    annotatorId,
    dataSampleId,
    dimensions,
    activeDimensionIndex,
    setActiveDimensionIndex,
    guidedRatings,
    guidedLabelFileName,
    modalities,
    executionMode,
  } = useSessionStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const gamingSpaceVideoRef = useRef<HTMLVideoElement>(null);
  const modalityVideoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const playTimerRef = useRef<number | null>(null);
  const frameAdvanceTimerRef = useRef<number | null>(null);
  const autoplayTimersRef = useRef<number[]>([]);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const hasGamingSpace = gamingSpaceMedia !== null;

  const activeModalities = useMemo(() => {
    return modalities.filter(
      (m) => m.type !== null && (m.files.length > 0 || (m.telemetryData && m.telemetryData.length > 0))
    );
  }, [modalities]);

  const [isMuted, setIsMuted] = useState(false);
  const [audioPadMode, setAudioPadMode] = useState<AudioPadMode>('exact');
  const [playMode, setPlayMode] = useState<PlayMode>('autoplay');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const playbackSpeedRef = useRef<number>(1);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const [stepStartEventIndex, setStepStartEventIndex] = useState<number>(0);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Export configuration state (re-open append option as default)
  const [exportMode, setExportMode] = useState<'append' | 'label_only'>('append');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [isFileNameDirty, setIsFileNameDirty] = useState<boolean>(false);

  const activeDim = dimensions[activeDimensionIndex] || { name: 'Valence', min: -1, max: 1, step: 0.1 };
  const activeDimName = activeDim.name;
  const ratingConfig = activeDim;

  const currentRating = ratings[activeDimName]?.[currentEventIndex] ?? 0;
  const activeVisitedEvents = visitedEvents[activeDimName] || new Set<number>();

  // Check if all dimensions or single-pass frames are complete
  const allDimensionsComplete = useMemo(() => {
    if (executionMode === 'single_pass') {
      return Array.from({ length: timelineEvents.length }, (_, i) => i).every((idx) => {
        return dimensions.some((dim) => visitedEvents[dim.name]?.has(idx));
      });
    }
    return dimensions.every((dim) => {
      const visited = visitedEvents[dim.name];
      return visited && visited.size >= timelineEvents.length;
    });
  }, [executionMode, dimensions, visitedEvents, timelineEvents.length]);

  const allVisited = useMemo(() => {
    if (executionMode === 'single_pass') {
      return Array.from({ length: timelineEvents.length }, (_, i) => i).every((idx) => {
        return dimensions.some((dim) => visitedEvents[dim.name]?.has(idx));
      });
    }
    return activeVisitedEvents.size >= timelineEvents.length;
  }, [executionMode, dimensions, visitedEvents, activeVisitedEvents, timelineEvents.length]);

  // Set active dimension on mount to the first incomplete one
  useEffect(() => {
    const firstIncompleteIdx = dimensions.findIndex((dim) => {
      const visited = visitedEvents[dim.name];
      return !visited || visited.size < timelineEvents.length;
    });
    if (firstIncompleteIdx !== -1) {
      setActiveDimensionIndex(firstIncompleteIdx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDimensionChange = (newIndex: number) => {
    if (executionMode === 'single_pass') {
      setActiveDimensionIndex(newIndex);
      return;
    }

    const currentActiveDimName = dimensions[activeDimensionIndex].name;
    const currentActiveVisited = visitedEvents[currentActiveDimName];
    const isComplete = currentActiveVisited && currentActiveVisited.size >= timelineEvents.length;

    if (!isComplete) {
      alert(`Please complete labeling all frames for "${currentActiveDimName}" before switching dimensions.`);
      return;
    }

    setActiveDimensionIndex(newIndex);
  };

  // Compute the suggested/default output filename
  const baseName = useMemo(() => {
    return telemetryFileName.replace(/\.csv$/i, '');
  }, [telemetryFileName]);

  const suggestedFileName = useMemo(() => {
    const cleanDataSampleId = dataSampleId || '';
    const cleanAnnotatorId = annotatorId || '';
    if (exportMode === 'append') {
      return `${baseName}_${cleanDataSampleId}_${cleanAnnotatorId}_labeled.csv`;
    } else {
      return `label_${cleanDataSampleId}_${cleanAnnotatorId}.csv`;
    }
  }, [baseName, dataSampleId, annotatorId, exportMode]);

  // Automatically update the filename input if the user hasn't typed in it
  useEffect(() => {
    if (!isFileNameDirty) {
      setCustomFileName(suggestedFileName);
    }
  }, [suggestedFileName, isFileNameDirty]);

  const handleExportModeChange = (mode: 'append' | 'label_only') => {
    setExportMode(mode);
  };

  const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomFileName(val);
    if (val === '') {
      setIsFileNameDirty(false);
    } else {
      setIsFileNameDirty(true);
    }
  };

  // Sync stepStartEventIndex when timelineEvents changes (Render-phase state update to avoid cascading effect renders)
  const [prevTimelineEvents, setPrevTimelineEvents] = useState(timelineEvents);
  if (timelineEvents !== prevTimelineEvents) {
    setPrevTimelineEvents(timelineEvents);
    setStepStartEventIndex(currentEventIndex);
  }

  // Auto-zoom: target ~10px spacing between dots at container width ~900px
  const autoZoom = useMemo(() => {
    if (timelineEvents.length <= 1) return 1;
    const containerWidth = 900; // approximate
    const desiredGap = 10; // px between dots
    const neededWidth = timelineEvents.length * desiredGap;
    return Math.max(1, neededWidth / containerWidth);
  }, [timelineEvents.length]);

  const timelineZoom = zoomOverride ?? autoZoom;

  const currentEvent = timelineEvents[currentEventIndex];
  const currentRow = currentEvent ? telemetryData[currentEvent.rowIndex] : null;

  // Find the next event index that has a game log (telemetry row)
  const findNextLogEventIndex = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex + 1; i < timelineEvents.length; i++) {
        const evt = timelineEvents[i];
        if (telemetryData[evt.rowIndex]) return i;
      }
      return null;
    },
    [timelineEvents, telemetryData],
  );

  // Init WaveSurfer
  useEffect(() => {
    if (!waveContainerRef.current || !audioUrl) return;

    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: 'rgba(108, 92, 231, 0.4)',
      progressColor: '#6c5ce7',
      cursorColor: '#e8e8ed',
      cursorWidth: 2,
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      backend: 'WebAudio',
    });

    ws.load(audioUrl);
    ws.on('ready', () => {
      ws.setPlaybackRate(playbackSpeedRef.current, true);
    });
    waveSurferRef.current = ws;

    return () => {
      ws.destroy();
      waveSurferRef.current = null;
    };
  }, [audioUrl]);

  // Apply mute state to wavesurfer
  useEffect(() => {
    if (waveSurferRef.current) {
      waveSurferRef.current.setVolume(isMuted ? 0 : 1);
    }
  }, [isMuted]);

  const formatOffset = (offsetSec: number) => {
    if (!offsetSec || offsetSec === 0) return null;
    const sign = offsetSec > 0 ? '+' : '-';
    const abs = Math.abs(offsetSec);
    const m = Math.floor(abs / 60).toString().padStart(2, '0');
    const s = Math.round(abs % 60).toString().padStart(2, '0');
    return `${sign}${m}:${s}`;
  };

  const getCurrentImageForModality = useCallback((cell: any) => {
    if (!cell.files || cell.files.length === 0 || !currentEvent) return null;
    const effectiveTime = Math.max(0, currentEvent.relativeTime + (cell.skipOffset || 0));
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < cell.files.length; i++) {
      const file = cell.files[i];
      const time = parseImageFilenameToTime(file.name);
      if (time !== null) {
        const diff = Math.abs(time - effectiveTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
    }
    if (closestIndex !== -1) return cell.urls[closestIndex];
    const idx = Math.min(currentEventIndex, cell.urls.length - 1);
    return cell.urls[idx];
  }, [currentEvent, currentEventIndex]);

  // Seek media to current event (only when NOT playing — play handles its own seeking)
  useEffect(() => {
    if (!currentEvent || isPlaying) return;

    // Seek legacy video
    if (videoRef.current && gameplayMedia?.type === 'video') {
      videoRef.current.currentTime = currentEvent.relativeTime;
    }

    // Seek legacy gaming space video
    if (gamingSpaceVideoRef.current && gamingSpaceMedia) {
      gamingSpaceVideoRef.current.currentTime = Math.max(0, currentEvent.relativeTime + gamingSpaceMedia.skipOffset);
    }

    // Seek all active modality videos applying each cell's skipOffset
    activeModalities.forEach((cell) => {
      const el = modalityVideoRefs.current[cell.id];
      if (el && cell.type === 'video') {
        el.currentTime = Math.max(0, currentEvent.relativeTime + (cell.skipOffset || 0));
      }
    });

    // Seek audio waveform
    if (waveSurferRef.current && totalDuration > 0) {
      const audioCell = activeModalities.find((m) => m.type === 'audio');
      const audioOffset = audioCell?.skipOffset || 0;
      const progress = Math.max(0, currentEvent.relativeTime + audioOffset) / totalDuration;
      waveSurferRef.current.seekTo(Math.min(1, Math.max(0, progress)));
    }
  }, [currentEventIndex, currentEvent, gameplayMedia, gamingSpaceMedia, activeModalities, totalDuration, isPlaying]);

  // Auto-scroll timeline to keep active marker visible
  useEffect(() => {
    const scroll = timelineScrollRef.current;
    if (!scroll || !currentEvent || totalDuration <= 0) return;
    const ratio = currentEvent.relativeTime / totalDuration;
    const trackWidth = scroll.scrollWidth;
    const targetX = ratio * trackWidth;
    const center = scroll.clientWidth / 2;
    scroll.scrollTo({ left: targetX - center, behavior: 'smooth' });
  }, [currentEventIndex, currentEvent, totalDuration, timelineZoom]);
  const clearAllTimers = useCallback(() => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    if (frameAdvanceTimerRef.current) {
      clearTimeout(frameAdvanceTimerRef.current);
      frameAdvanceTimerRef.current = null;
    }
    autoplayTimersRef.current.forEach((t) => clearTimeout(t));
    autoplayTimersRef.current = [];
  }, []);

  // Stop playback fully
  const stopPlayback = useCallback(() => {
    setPlaying(false);
    clearAllTimers();
    if (videoRef.current) videoRef.current.pause();
    if (gamingSpaceVideoRef.current) gamingSpaceVideoRef.current.pause();
    if (waveSurferRef.current) waveSurferRef.current.pause();
    Object.values(modalityVideoRefs.current).forEach((el) => el.pause());
  }, [setPlaying, clearAllTimers]);

  // === STEP MODE: Play from current event to next event with game log ===
  const handleStepPlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const startIdx = stepStartEventIndex;
    const endIdx = findNextLogEventIndex(startIdx);
    if (endIdx === null) return;

    const startTime = timelineEvents[startIdx].relativeTime;
    const endTime = timelineEvents[endIdx].relativeTime;
    const speed = playbackSpeedRef.current;
    const segmentDurationMs = ((endTime - startTime) * 1000) / speed;
    if (segmentDurationMs <= 0) return;

    // Immediately seek visual elements/state to the start frame of the step segment
    seekToEvent(startIdx);
    setPlaying(true);

    // Audio start/end based on pad mode
    const audioStart = audioPadMode === 'padded' ? Math.max(0, startTime - 2) : startTime;
    const audioEnd = audioPadMode === 'padded' ? Math.min(totalDuration, endTime + 2) : endTime;

    // Seek and play audio
    if (waveSurferRef.current && totalDuration > 0) {
      waveSurferRef.current.seekTo(Math.min(1, Math.max(0, audioStart / totalDuration)));
      waveSurferRef.current.setPlaybackRate(speed, true);
      waveSurferRef.current.play();
      const audioDurationMs = ((audioEnd - audioStart) * 1000) / speed;
      playTimerRef.current = window.setTimeout(() => {
        if (waveSurferRef.current) waveSurferRef.current.pause();
      }, audioDurationMs);
    }

    // Seek and play video
    if (videoRef.current && gameplayMedia?.type === 'video') {
      videoRef.current.currentTime = startTime;
      videoRef.current.playbackRate = speed;
      videoRef.current.play();
    }

    // Seek and play gaming space video
    if (gamingSpaceVideoRef.current && gamingSpaceMedia) {
      gamingSpaceVideoRef.current.currentTime = Math.max(0, startTime + gamingSpaceMedia.skipOffset);
      gamingSpaceVideoRef.current.playbackRate = speed;
      gamingSpaceVideoRef.current.play();
    }

    // Seek and play all active modality videos
    activeModalities.forEach((cell) => {
      const el = modalityVideoRefs.current[cell.id];
      if (el && cell.type === 'video') {
        el.currentTime = Math.max(0, startTime + (cell.skipOffset || 0));
        el.playbackRate = speed;
        el.play();
      }
    });

    // Schedule frame advances
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const delayMs = ((timelineEvents[i].relativeTime - startTime) * 1000) / speed;
      const timerId = window.setTimeout(() => {
        seekToEvent(i);
        if (i === endIdx) {
          setPlaying(false);
          if (videoRef.current) videoRef.current.pause();
          if (gamingSpaceVideoRef.current) gamingSpaceVideoRef.current.pause();
          Object.values(modalityVideoRefs.current).forEach((el) => el.pause());
        }
      }, delayMs);
      if (i === endIdx) frameAdvanceTimerRef.current = timerId;
    }
  }, [
    isPlaying, stepStartEventIndex, findNextLogEventIndex, timelineEvents,
    totalDuration, audioPadMode, gameplayMedia, gamingSpaceMedia, activeModalities, setPlaying, seekToEvent, stopPlayback,
  ]);

  // === AUTOPLAY MODE: Continuous playback, auto-assign ratings ===
  const handleAutoplay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const startIdx = currentEventIndex;
    if (startIdx >= timelineEvents.length - 1) return;

    const startTime = timelineEvents[startIdx].relativeTime;
    const speed = playbackSpeedRef.current;

    setPlaying(true);

    // Play audio from startTime to end of timeline
    if (waveSurferRef.current && totalDuration > 0) {
      waveSurferRef.current.seekTo(Math.min(1, Math.max(0, startTime / totalDuration)));
      waveSurferRef.current.setPlaybackRate(speed, true);
      waveSurferRef.current.play();
    }

    // Play video
    if (videoRef.current && gameplayMedia?.type === 'video') {
      videoRef.current.currentTime = startTime;
      videoRef.current.playbackRate = speed;
      videoRef.current.play();
    }

    // Play gaming space video
    if (gamingSpaceVideoRef.current && gamingSpaceMedia) {
      gamingSpaceVideoRef.current.currentTime = Math.max(0, startTime + gamingSpaceMedia.skipOffset);
      gamingSpaceVideoRef.current.playbackRate = speed;
      gamingSpaceVideoRef.current.play();
    }

    // Play all active modality videos
    activeModalities.forEach((cell) => {
      const el = modalityVideoRefs.current[cell.id];
      if (el && cell.type === 'video') {
        el.currentTime = Math.max(0, startTime + (cell.skipOffset || 0));
        el.playbackRate = speed;
        el.play();
      }
    });

    // Schedule auto-advance for ALL remaining frames
    // Each frame uses autoplaySeekToEvent which carries forward current rating
    const timers: number[] = [];
    for (let i = startIdx + 1; i < timelineEvents.length; i++) {
      const delayMs = ((timelineEvents[i].relativeTime - startTime) * 1000) / speed;
      const timerId = window.setTimeout(() => {
        autoplaySeekToEvent(i);

        // If last frame, stop everything
        if (i === timelineEvents.length - 1) {
          setPlaying(false);
          if (videoRef.current) videoRef.current.pause();
          if (gamingSpaceVideoRef.current) gamingSpaceVideoRef.current.pause();
          if (waveSurferRef.current) waveSurferRef.current.pause();
          Object.values(modalityVideoRefs.current).forEach((el) => el.pause());
        }
      }, delayMs);
      timers.push(timerId);
    }
    autoplayTimersRef.current = timers;
  }, [
    isPlaying, currentEventIndex, timelineEvents, totalDuration,
    gameplayMedia, gamingSpaceMedia, activeModalities, setPlaying, autoplaySeekToEvent, stopPlayback,
  ]);

  // Dynamic speed adjustment (applies immediately, even while playing)
  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setPlaybackSpeed(newSpeed);
      playbackSpeedRef.current = newSpeed;

      if (videoRef.current) {
        videoRef.current.playbackRate = newSpeed;
      }
      if (gamingSpaceVideoRef.current) {
        gamingSpaceVideoRef.current.playbackRate = newSpeed;
      }
      if (waveSurferRef.current) {
        waveSurferRef.current.setPlaybackRate(newSpeed, true);
      }
      Object.values(modalityVideoRefs.current).forEach((el) => {
        el.playbackRate = newSpeed;
      });

      // If actively playing, reschedule remaining timers from the current frame position
      if (isPlaying) {
        clearAllTimers();

        const curIdx = currentEventIndex;
        if (curIdx >= timelineEvents.length - 1) return;
        const curTime = timelineEvents[curIdx]?.relativeTime ?? 0;

        if (playMode === 'autoplay') {
          const timers: number[] = [];
          for (let i = curIdx + 1; i < timelineEvents.length; i++) {
            const delayMs = ((timelineEvents[i].relativeTime - curTime) * 1000) / newSpeed;
            const timerId = window.setTimeout(() => {
              autoplaySeekToEvent(i);

              if (i === timelineEvents.length - 1) {
                setPlaying(false);
                if (videoRef.current) videoRef.current.pause();
                if (gamingSpaceVideoRef.current) gamingSpaceVideoRef.current.pause();
                if (waveSurferRef.current) waveSurferRef.current.pause();
                Object.values(modalityVideoRefs.current).forEach((el) => el.pause());
              }
            }, delayMs);
            timers.push(timerId);
          }
          autoplayTimersRef.current = timers;
        } else if (playMode === 'step') {
          const endIdx = findNextLogEventIndex(stepStartEventIndex);
          if (endIdx !== null && curIdx < endIdx) {
            const endTime = timelineEvents[endIdx].relativeTime;
            const audioEnd = audioPadMode === 'padded' ? Math.min(totalDuration, endTime + 2) : endTime;
            const remainingAudioMs = Math.max(0, ((audioEnd - curTime) * 1000) / newSpeed);

            playTimerRef.current = window.setTimeout(() => {
              if (waveSurferRef.current) waveSurferRef.current.pause();
            }, remainingAudioMs);

            for (let i = curIdx + 1; i <= endIdx; i++) {
              const delayMs = ((timelineEvents[i].relativeTime - curTime) * 1000) / newSpeed;
              const timerId = window.setTimeout(() => {
                seekToEvent(i);
                if (i === endIdx) {
                  setPlaying(false);
                  if (videoRef.current) videoRef.current.pause();
                  if (gamingSpaceVideoRef.current) gamingSpaceVideoRef.current.pause();
                  Object.values(modalityVideoRefs.current).forEach((el) => el.pause());
                }
              }, delayMs);
              if (i === endIdx) frameAdvanceTimerRef.current = timerId;
            }
          }
        }
      }
    },
    [
      isPlaying,
      currentEventIndex,
      timelineEvents,
      playMode,
      stepStartEventIndex,
      findNextLogEventIndex,
      audioPadMode,
      totalDuration,
      autoplaySeekToEvent,
      seekToEvent,
      setPlaying,
      clearAllTimers,
    ],
  );

  // Manual navigation wrappers to track step mode starting frame
  const manualPrev = useCallback(() => {
    stopPlayback();
    prevEvent();
    setStepStartEventIndex(Math.max(0, currentEventIndex - 1));
  }, [stopPlayback, prevEvent, currentEventIndex]);

  const manualNext = useCallback(() => {
    stopPlayback();
    nextEvent();
    setStepStartEventIndex(Math.min(timelineEvents.length - 1, currentEventIndex + 1));
  }, [stopPlayback, nextEvent, currentEventIndex, timelineEvents.length]);

  const manualSeek = useCallback((index: number) => {
    stopPlayback();
    seekToEvent(index);
    setStepStartEventIndex(index);
  }, [stopPlayback, seekToEvent]);

  // Unified play/pause handler based on mode
  const handlePlayPause = useCallback(() => {
    if (playMode === 'autoplay') {
      handleAutoplay();
    } else {
      handleStepPlay();
    }
  }, [playMode, handleAutoplay, handleStepPlay]);

  // Clear timers on unmount only (manual nav already calls stopPlayback explicitly)
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'Home':
          e.preventDefault();
          manualSeek(0);
          break;
        case 'End':
          e.preventDefault();
          manualSeek(timelineEvents.length - 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          manualPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          manualNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          rateUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          rateDown();
          break;
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setIsMuted((prev) => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [manualSeek, manualPrev, manualNext, rateUp, rateDown, handlePlayPause, timelineEvents.length]);

  // Mouse wheel rating control (#4)
  const wheelAccumulatorRef = useRef(0);
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input') ||
        target?.closest('textarea') ||
        target?.closest('select') ||
        target?.closest(`.${styles.timelineScroll}`)
      ) {
        return;
      }

      e.preventDefault();
      wheelAccumulatorRef.current += e.deltaY;
      const threshold = 30;

      if (wheelAccumulatorRef.current <= -threshold) {
        rateUp();
        wheelAccumulatorRef.current = 0;
      } else if (wheelAccumulatorRef.current >= threshold) {
        rateDown();
        wheelAccumulatorRef.current = 0;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [rateUp, rateDown]);

  // Export handler
  const handleSubmit = () => {
    submitSession();
    exportLabeledCSV(
      telemetryHeaders,
      telemetryData,
      ratings,
      telemetryFileName,
      exportMode,
      customFileName,
      dimensions
    );
  };

  // Key telemetry fields to highlight
  const highlightFields = [
    'player_health', 'player_max_health', 'score', 'player_is_firing',
    'active_weapon_name', 'boss_active', 'boss_name', 'boss_health',
    'enemy_0_type', 'enemy_0_health', 'dungeon_level', 'room_index',
    'input_intensity', 'activity', 'movement',
  ];

  // Get image for current event (image mode)
  const getCurrentImage = () => {
    if (!gameplayMedia || gameplayMedia.type !== 'images') return null;
    if (!currentEvent) return null;

    // 1. Try to match exact time_passed column
    if (currentRow && currentRow['time_passed']) {
      const timePassed = currentRow['time_passed'];
      const matchIndex = gameplayMedia.files.findIndex((file) =>
        file.name.includes(timePassed),
      );
      if (matchIndex !== -1) {
        return gameplayMedia.urls[matchIndex];
      }
    }

    // 2. Fallback to parse time from filename and find the closest one
    let closestIndex = -1;
    let minDiff = Infinity;

    for (let i = 0; i < gameplayMedia.files.length; i++) {
      const file = gameplayMedia.files[i];
      const time = parseImageFilenameToTime(file.name);
      if (time !== null) {
        const diff = Math.abs(time - currentEvent.relativeTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      return gameplayMedia.urls[closestIndex];
    }

    // 3. Fallback to sequential
    const idx = Math.min(currentEventIndex, gameplayMedia.urls.length - 1);
    return gameplayMedia.urls[idx];
  };

  // Info about the next log frame for UI
  const nextLogIdx = findNextLogEventIndex(
    playMode === 'step' ? stepStartEventIndex : currentEventIndex
  );
  const canPlay = playMode === 'autoplay'
    ? currentEventIndex < timelineEvents.length - 1
    : nextLogIdx !== null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        {/* Top: synced display (Modal Adapter Grid or legacy fallback) */}
        {activeModalities.length > 0 ? (
          <div
            className={`${styles.modalAdapterGrid} ${
              activeModalities.length === 1
                ? styles.modalGrid1
                : activeModalities.length === 2
                ? styles.modalGrid2
                : activeModalities.length === 3
                ? styles.modalGrid3
                : activeModalities.length === 4
                ? styles.modalGrid4
                : styles.modalGridMulti
            }`}
          >
            {activeModalities.map((cell) => {
              const offsetStr = formatOffset(cell.skipOffset);
              return (
                <div
                  key={cell.id}
                  className={`${styles.block} ${
                    cell.type === 'audio'
                      ? styles.audioBlock
                      : cell.type === 'telemetry'
                      ? styles.telemetryInlineBlock
                      : styles.gameplayBlock
                  }`}
                >
                  <div className={styles.blockLabel}>
                    <span>{cell.name || cell.type}</span>
                    {offsetStr && <span className={styles.offsetPill}>Skip: {offsetStr}</span>}
                  </div>

                  {cell.type === 'video' && cell.urls[0] && (
                    <video
                      ref={(el) => {
                        if (el) modalityVideoRefs.current[cell.id] = el;
                        else delete modalityVideoRefs.current[cell.id];
                      }}
                      src={cell.urls[0]}
                      className={styles.videoPlayer}
                      muted
                    />
                  )}

                  {cell.type === 'images' && (
                    (() => {
                      const imgUrl = getCurrentImageForModality(cell);
                      return imgUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={imgUrl} alt={cell.name} className={styles.frameImage} />
                      ) : (
                        <div className={styles.sidebarEmpty}>No frame available</div>
                      );
                    })()
                  )}

                  {cell.type === 'audio' && (
                    <div ref={waveContainerRef} className={styles.waveContainer} />
                  )}

                  {cell.type === 'telemetry' && (
                    cell.telemetryData && cell.telemetryData[currentEvent?.rowIndex ?? 0] ? (
                      <div className={styles.telemetryGrid}>
                        {highlightFields.map((field) => {
                          const row = cell.telemetryData![currentEvent?.rowIndex ?? 0];
                          return row && row[field] !== undefined ? (
                            <div key={field} className={styles.telemetryInlineRow}>
                              <span className={styles.sidebarKey}>{field.replace(/^.*?_/, '')}</span>
                              <span className={styles.sidebarValue}>{row[field]}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <div className={styles.sidebarEmpty}>No telemetry data for this frame</div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={hasGamingSpace ? styles.grid2x2 : styles.gridNoGamingSpace}>
            {/* Block 1: Audio Waveform */}
            <div className={`${styles.block} ${styles.audioBlock}`}>
              <div className={styles.blockLabel}>🎵 Audio Waveform</div>
              <div ref={waveContainerRef} className={styles.waveContainer} />
            </div>

            {/* Block 2: Telemetry Log */}
            <div className={`${styles.block} ${styles.telemetryInlineBlock}`}>
              <div className={styles.blockLabel}>📊 Telemetry Log</div>
              {currentRow ? (
                <div className={styles.telemetryGrid}>
                  {highlightFields.map((field) =>
                    currentRow[field] !== undefined ? (
                      <div key={field} className={styles.telemetryInlineRow}>
                        <span className={styles.sidebarKey}>{field.replace(/^.*?_/, '')}</span>
                        <span className={styles.sidebarValue}>{currentRow[field]}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className={styles.sidebarEmpty}>No telemetry data for this frame</div>
              )}
            </div>

            {/* Block 3: Gameplay */}
            <div className={`${styles.block} ${styles.gameplayBlock}`}>
              {gameplayMedia?.type === 'video' ? (
                <video
                  ref={videoRef}
                  src={gameplayMedia.urls[0]}
                  className={styles.videoPlayer}
                  muted
                />
              ) : (
                getCurrentImage() && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={getCurrentImage()!} alt="Gameplay frame" className={styles.frameImage} />
                )
              )}
              <div className={styles.blockLabel}>
                🎮 Frame {currentEventIndex + 1} / {timelineEvents.length}
              </div>
            </div>

            {/* Block 4: Gaming Space */}
            {hasGamingSpace && (
              <div className={`${styles.block} ${styles.gamingSpaceBlock}`}>
                <video
                  ref={gamingSpaceVideoRef}
                  src={gamingSpaceMedia?.url}
                  className={styles.gamingSpaceVideo}
                  muted
                />
                <div className={styles.blockLabel}>🎥 Gaming Space</div>
              </div>
            )}
          </div>
        )}

        {/* Timeline Bar */}
        <div className={styles.timelineSection}>
          <div className={styles.timelineBar}>
            {/* Toolbar: Speed slider on left, Zoom controls on right */}
            <div className={styles.timelineToolbar}>
              <div className={styles.speedControl}>
                <span className={styles.speedLabel}>Speed</span>
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.25"
                  value={playbackSpeed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  className={styles.speedSlider}
                  id="playback-speed-slider"
                  title={`Playback speed: ${playbackSpeed}x`}
                />
                <span className={styles.speedValue}>{playbackSpeed}x</span>
                {playbackSpeed !== 1 && (
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={() => handleSpeedChange(1)}
                    title="Reset speed to 1.0x"
                  >
                    ↺
                  </button>
                )}
              </div>

              <div className={styles.zoomControls}>
                <span className={styles.zoomTextLabel}>Zoom</span>
                {zoomOverride !== null && (
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={() => setZoomOverride(null)}
                    title="Reset to auto zoom"
                  >
                    ↺
                  </button>
                )}
                <button
                  className="btn btn-icon btn-sm"
                  onClick={() => setZoomOverride(Math.max(1, timelineZoom / 1.5))}
                  title="Zoom out"
                >
                  −
                </button>
                <span className={styles.zoomLabel}>{timelineZoom.toFixed(1)}x</span>
                <button
                  className="btn btn-icon btn-sm"
                  onClick={() => setZoomOverride(timelineZoom * 1.5)}
                  title="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
            <div className={styles.timelineScroll} ref={timelineScrollRef}>
              <div
                className={styles.timelineTrack}
                style={{ width: `${timelineZoom * 100}%` }}
              >
                {/* Dots */}
                {timelineEvents.map((evt, i) => (
                  <button
                    key={i}
                    data-marker-index={i}
                    className={`${styles.timelineMarker} ${i === currentEventIndex ? styles.markerActive : ''} ${activeVisitedEvents.has(i) ? styles.markerVisited : ''}`}
                    style={{
                      left: totalDuration > 0 ? `${(evt.relativeTime / totalDuration) * 100}%` : '0%',
                      backgroundColor: activeVisitedEvents.has(i) ? getRatingColor(ratings[activeDimName]?.[i] ?? 0, ratingConfig.min, ratingConfig.max) : undefined,
                    }}
                    onClick={() => {
                      manualSeek(i);
                    }}
                    title={formatTime(evt.relativeTime)}
                  />
                ))}

                {/* Playhead */}
                {currentEvent && totalDuration > 0 && (
                  <div
                    className={styles.playhead}
                    style={{ left: `${(currentEvent.relativeTime / totalDuration) * 100}%` }}
                  >
                    <div className={styles.playheadTooltip}>
                      {formatTime(currentEvent.relativeTime)}
                    </div>
                    <div className={styles.playheadLine} />
                  </div>
                )}
              </div>
            </div>
            <div className={styles.timelineLabels}>
              <span>{formatTime(currentEvent?.relativeTime ?? 0)}</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            {/* Play mode toggle */}
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeOption} ${playMode === 'step' ? styles.modeActive : ''}`}
                onClick={() => {
                  stopPlayback();
                  setPlayMode('step');
                  setStepStartEventIndex(currentEventIndex);
                }}
                title="Step mode: play frame-by-frame between game log events"
              >
                Step
              </button>
              <button
                className={`${styles.modeOption} ${playMode === 'autoplay' ? styles.modeActive : ''}`}
                onClick={() => {
                  stopPlayback();
                  setPlayMode('autoplay');
                }}
                title="Autoplay: continuous playback, auto-assigns current rating to passed frames"
              >
                Autoplay
              </button>
            </div>

            {/* Nav controls */}
            <div className={styles.navControls}>
              <button
                className="btn btn-icon"
                onClick={() => manualSeek(0)}
                disabled={currentEventIndex <= 0}
                title="First Frame (Home)"
                id="btn-first-frame"
              >
                ⏮
              </button>
              <button
                className="btn btn-icon"
                onClick={manualPrev}
                disabled={currentEventIndex <= 0}
                title="Previous (←)"
                id="btn-prev-frame"
              >
                ◀
              </button>
              <button
                className={`btn btn-icon ${isPlaying ? styles.playingBtn : ''}`}
                onClick={handlePlayPause}
                disabled={!canPlay}
                title="Play/Pause (Space)"
                id="btn-play-pause"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className="btn btn-icon"
                onClick={manualNext}
                disabled={currentEventIndex >= timelineEvents.length - 1}
                title="Next (→)"
                id="btn-next-frame"
              >
                ▶▶
              </button>
              <button
                className="btn btn-icon"
                onClick={() => manualSeek(timelineEvents.length - 1)}
                disabled={currentEventIndex >= timelineEvents.length - 1}
                title="Final Frame (End)"
                id="btn-final-frame"
              >
                ⏭
              </button>
            </div>

            {/* Audio controls: mute + pad mode */}
            <div className={styles.audioControls}>
              <button
                className={`btn btn-icon btn-sm ${isMuted ? styles.mutedBtn : ''}`}
                onClick={() => setIsMuted((prev) => !prev)}
                title={`${isMuted ? 'Unmute' : 'Mute'} (M)`}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              {playMode === 'step' && (
                <div className={styles.padToggle}>
                  <button
                    className={`${styles.padOption} ${audioPadMode === 'exact' ? styles.padActive : ''}`}
                    onClick={() => setAudioPadMode('exact')}
                    title="Play audio exactly from event to event"
                  >
                    Exact
                  </button>
                  <button
                    className={`${styles.padOption} ${audioPadMode === 'padded' ? styles.padActive : ''}`}
                    onClick={() => setAudioPadMode('padded')}
                    title="Play audio with ±2s padding around events"
                  >
                    ±2s
                  </button>
                </div>
              )}
            </div>



            {/* Event counter */}
            <div className={styles.eventCounter}>
              <span className={styles.eventIndex}>{currentEventIndex + 1}</span>
              <span className={styles.eventSep}>/</span>
              <span className={styles.eventTotal}>{timelineEvents.length}</span>
            </div>

            {/* Rating controls */}
            <div className={styles.ratingControls}>
              <button
                className="btn btn-icon"
                onClick={rateUp}
                disabled={currentRating >= ratingConfig.max}
                title="Rate Up (↑)"
              >
                ▲
              </button>
              <div
                className={styles.ratingDisplay}
                style={{
                  color: getRatingColor(currentRating, ratingConfig.min, ratingConfig.max),
                  borderColor: getRatingColor(currentRating, ratingConfig.min, ratingConfig.max),
                }}
              >
                <span className={styles.ratingNumber}>{currentRating > 0 ? `+${currentRating}` : currentRating}</span>
              </div>
              <button
                className="btn btn-icon"
                onClick={rateDown}
                disabled={currentRating <= ratingConfig.min}
                title="Rate Down (↓)"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Submit Section */}
          {allVisited && sessionState !== 'completed' && (
            <div className={styles.submitContainer}>
              <div className={styles.submitControls}>
                {/* Output Mode Toggle */}
                <div className={styles.exportModeGroup}>
                  <span className={styles.submitLabel}>Output Mode</span>
                  <div className={styles.toggleContainer}>
                    <button
                      type="button"
                      className={`${styles.toggleOption} ${exportMode === 'append' ? styles.toggleActive : ''}`}
                      onClick={() => handleExportModeChange('append')}
                      id="btn-export-append"
                    >
                      Append to CSV source
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggleOption} ${exportMode === 'label_only' ? styles.toggleActive : ''}`}
                      onClick={() => handleExportModeChange('label_only')}
                      id="btn-export-label-only"
                    >
                      Export label only
                    </button>
                  </div>
                </div>

                {/* Filename Input */}
                <div className={styles.filenameGroup}>
                  <span className={styles.submitLabel}>Output Filename</span>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={handleFilenameChange}
                    className={styles.filenameInput}
                    placeholder="Output filename"
                    id="custom-filename-input"
                  />
                </div>
              </div>

              <button
                className="btn btn-primary animate-glow"
                onClick={handleSubmit}
                id="btn-submit"
                disabled={!allDimensionsComplete}
              >
                {allDimensionsComplete ? '✅ Submit & Export Labeled CSV' : '⏳ Complete All Dimensions to Submit'}
              </button>
              {!allDimensionsComplete && (
                <p className={styles.submitWarning} style={{ color: 'var(--warning)', fontSize: '12px', marginTop: '4px' }}>
                  ⚠️ Please complete labeling all frames for all dimensions before submitting.
                </p>
              )}
            </div>
          )}
          {sessionState === 'completed' && (
            <div className={styles.completedBanner}>
              ✅ Session completed! Labeled CSV has been downloaded as: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{customFileName}</span>
            </div>
          )}
        </div>

        {/* Score Graph */}
        <div className={`${styles.block} ${styles.scoreGraphBlock}`}>
          <div className={styles.blockLabel} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📈 Score Timeline: </span>
            <select
              value={activeDimensionIndex}
              onChange={(e) => handleDimensionChange(parseInt(e.target.value, 10))}
              className={styles.dimensionDropdown}
            >
              {dimensions.map((dim, idx) => (
                <option key={dim.name} value={idx}>
                  {dim.name}
                </option>
              ))}
            </select>
            {guidedRatings[activeDimName] && guidedRatings[activeDimName].length > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  marginLeft: '4px',
                }}
                title={guidedLabelFileName ? `Guided Reference: ${guidedLabelFileName}` : 'Guided reference line enabled'}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '2px',
                    background: 'rgba(255, 255, 255, 0.6)',
                    borderRadius: '1px',
                  }}
                />
                Guide
              </span>
            )}
          </div>
          <ScoreGraph />
        </div>
      </div>
    </div>
  );
}
