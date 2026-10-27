'use client';

import { useEffect, useState, useRef } from 'react';
import { useSessionStore } from '@/lib/store';
import UploadGrid from '@/components/UploadGrid';
import SessionView from '@/components/SessionView';
import QuickLoadModal from '@/components/QuickLoadModal';
import { parseCSV, parseGuidedLabelCSV, validateGuidedLabelColumns } from '@/lib/csv-parser';
import styles from './page.module.css';

const getTraceDefinition = (type?: string) => {
  switch (type) {
    case 'RankTrace':
      return 'unbounded and continuous trace';
    case 'BTrace':
      return 'binary trace';
    case 'GTrace':
    default:
      return 'bounded and continuous trace';
  }
};

export default function Home() {
  const {
    sessionState,
    gameplayMedia,
    gamingSpaceMedia,
    telemetryData,
    audioFile,
    startSession,
    setGameplayMedia,
    setTelemetryData,
    setAudioFile,
    annotatorId,
    dataSampleId,
    setAnnotatorId,
    setDataSampleId,
    dimensions,
    setDimensions,
    guidedLabelFile,
    guidedLabelFileName,
    guidedLabelHeaders,
    setGuidedLabelData,
    clearGuidedLabel,
    modalities,
    executionMode,
    setExecutionMode,
  } = useSessionStore();

  const [autoLoading, setAutoLoading] = useState(false);
  const [autoLoadError, setAutoLoadError] = useState('');
  const [quickLoadOpen, setQuickLoadOpen] = useState(false);
  const [useAiHelper, setUseAiHelper] = useState(false);

  // Guided file upload states
  const [guidedError, setGuidedError] = useState('');
  const [guidedLoading, setGuidedLoading] = useState(false);
  const guidedFileInputRef = useRef<HTMLInputElement>(null);

  // Active tag selected index (for editing its min, max, step)
  const [activeTagIndex, setActiveTagIndex] = useState<number>(0);
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);

  // TODO: uncomment this for future uncomment
  // const activeDim = dimensions[activeTagIndex] || { name: 'Emotion', min: -1, max: 1, step: 0.1 };
  const activeDim = dimensions[activeTagIndex] || { name: 'Valence', min: -1, max: 1, step: 0.1 };

  const [minStr, setMinStr] = useState(activeDim.min.toString());
  const [maxStr, setMaxStr] = useState(activeDim.max.toString());
  const [stepStr, setStepStr] = useState(activeDim.step.toString());
  const [validationError, setValidationError] = useState('');

  // Sync inputs when activeTagIndex or activeDim changes
  useEffect(() => {
    if (activeDim) {
      setMinStr(activeDim.min.toString());
      setMaxStr(activeDim.max.toString());
      setStepStr(activeDim.step.toString());
    }
  }, [activeTagIndex, activeDim]);

  const handleRatingConfigChange = (field: 'min' | 'max' | 'step', value: string) => {
    if (field === 'min') setMinStr(value);
    if (field === 'max') setMaxStr(value);
    if (field === 'step') setStepStr(value);

    const num = parseFloat(value);
    if (!isNaN(num)) {
      const newDims = [...dimensions];
      if (newDims[activeTagIndex]) {
        newDims[activeTagIndex] = {
          ...newDims[activeTagIndex],
          [field]: num
        };
        setDimensions(newDims);
      }
    }
  };

  const handleTracePresetSelect = (preset: 'GTrace' | 'RankTrace' | 'BTrace') => {
    const newDims = [...dimensions];
    if (newDims[activeTagIndex]) {
      let min = newDims[activeTagIndex].min;
      let max = newDims[activeTagIndex].max;
      let step = newDims[activeTagIndex].step;

      if (preset === 'GTrace') {
        min = -1;
        max = 1;
        step = 0.1;
      } else if (preset === 'RankTrace') {
        min = -3.40282347e38;
        max = 3.40282347e38;
        step = 0.1;
      } else if (preset === 'BTrace') {
        min = 0;
        max = 1;
        step = 1;
      }

      newDims[activeTagIndex] = {
        ...newDims[activeTagIndex],
        traceType: preset,
        min,
        max,
        step
      };
      setDimensions(newDims);
      setMinStr(min.toString());
      setMaxStr(max.toString());
      setStepStr(step.toString());
    }
  };

  const handleRenameTag = (index: number, newName: string) => {
    setEditingTagIndex(null);
    const trimmed = newName.trim();
    if (!trimmed) return;

    // Check duplicate
    const exists = dimensions.some((d, i) => i !== index && d.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      alert("A dimension with this name already exists.");
      return;
    }

    const newDims = [...dimensions];
    newDims[index] = {
      ...newDims[index],
      name: trimmed
    };
    setDimensions(newDims);
  };

  const handleRemoveTag = (index: number) => {
    if (dimensions.length <= 1) return;
    const newDims = dimensions.filter((_, i) => i !== index);
    setDimensions(newDims);
    if (activeTagIndex >= newDims.length) {
      setActiveTagIndex(newDims.length - 1);
    }
  };

  const handleAddTag = () => {
    let count = 1;
    let newName = `Dimension ${count}`;
    while (dimensions.some(d => d.name.toLowerCase() === newName.toLowerCase())) {
      count++;
      newName = `Dimension ${count}`;
    }

    const newDims = [
      ...dimensions,
      { name: newName, min: -1, max: 1, step: 0.1, traceType: 'GTrace' as const }
    ];
    setDimensions(newDims);
    setActiveTagIndex(newDims.length - 1);
  };

  // TODO: uncomment this for future uncomment
  // const handleValenceArousalPreset = () => {
  //   setDimensions([
  //     { name: 'Valence', min: -1, max: 1, step: 0.1, traceType: 'GTrace' as const },
  //     { name: 'Arousal', min: -1, max: 1, step: 0.1, traceType: 'GTrace' as const }
  //   ]);
  //   setActiveTagIndex(0);
  // };

  const handleGuidedFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGuidedError('');
    setGuidedLoading(true);

    const res = await parseGuidedLabelCSV(file);
    setGuidedLoading(false);

    if (res.error) {
      setGuidedError(res.error);
      return;
    }

    setGuidedLabelData(file, res.headers, res.rawData, file.name);

    // Validate columns against current dimensions
    const validation = validateGuidedLabelColumns(res.headers, dimensions);
    if (!validation.valid) {
      setGuidedError(
        `Warning: Guided file is missing dimension(s): ${validation.missingDimensions.map((m) => `"${m}"`).join(', ')}`
      );
    }
  };

  const handleClearGuidedFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearGuidedLabel();
    setGuidedError('');
    if (guidedFileInputRef.current) {
      guidedFileInputRef.current.value = '';
    }
  };

  const handleStartSession = () => {
    const confirmStart = window.confirm(
      'Label Dimension can not be changed while labeling and must be complete all'
    );
    if (!confirmStart) return;

    // Validate all dimensions
    for (const dim of dimensions) {
      const isRank = dim.traceType === 'RankTrace';
      const minVal = isRank ? dim.min : Math.round(dim.min);
      const maxVal = isRank ? dim.max : Math.round(dim.max);
      const stepVal = Math.round(dim.step * 100) / 100;

      if (isNaN(minVal) || isNaN(maxVal) || isNaN(stepVal)) {
        setValidationError(`Dimension "${dim.name}" has invalid numbers for Min, Max, and Step.`);
        return;
      }
      if (stepVal <= 0) {
        setValidationError(`Dimension "${dim.name}" step must be greater than 0.`);
        return;
      }
      if (!isRank && minVal >= maxVal) {
        setValidationError(`Dimension "${dim.name}" min must be less than max.`);
        return;
      }
    }

    // If guided label file is uploaded, require it to contain all chosen dimension columns
    if (guidedLabelHeaders && guidedLabelHeaders.length > 0) {
      const validation = validateGuidedLabelColumns(guidedLabelHeaders, dimensions);
      if (!validation.valid) {
        setValidationError(
          `Guided label file is missing required dimension column(s): ${validation.missingDimensions.map((m) => `"${m}"`).join(', ')}. Please update chosen dimensions or guided label file.`
        );
        return;
      }
    }

    setValidationError('');
    startSession();
  };

  useEffect(() => {
    // Only auto-load in development
    if (process.env.NODE_ENV !== 'development') return;

    // Only auto-load if nothing is loaded yet
    if (gameplayMedia || telemetryData.length > 0 || audioFile) return;

  }, [
    gameplayMedia,
    telemetryData.length,
    audioFile,
    setGameplayMedia,
    setTelemetryData,
    setAudioFile,
  ]);

  const isUpload = sessionState === 'upload';
  const hasLoadedModality = modalities.some(
    (m) => m.type !== null && (m.files.length > 0 || (m.telemetryData && m.telemetryData.length > 0))
  );
  const canStart =
    hasLoadedModality ||
    (gameplayMedia !== null && telemetryData.length > 0 && audioFile !== null);

  return (
    <div className={styles.page} data-gaming-space-available={!!gamingSpaceMedia}>
      {/* Dev Default Loader Overlay */}
      {autoLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingCard}>
            <div className={styles.loadingSpinner} />
            <h3 className={styles.loadingTitle}>Loading Defaults</h3>
            <p className={styles.loadingText}>
              Fetching and preparing default telemetry, audio, and gameplay image list for testing...
            </p>
          </div>
        </div>
      )}

      {autoLoadError && (
        <div className={styles.loadingOverlay} onClick={() => setAutoLoadError('')}>
          <div className={styles.loadingCard} onClick={(e) => e.stopPropagation()}>
            <span className={styles.errorIcon}>⚠️</span>
            <h3 className={styles.errorTitle}>Auto-Load Failed</h3>
            <p className={styles.errorText}>{autoLoadError}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => setAutoLoadError('')}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>🎮</span>
          Annotation Session Labeler
        </h1>
        <p className={styles.subtitle}>
          {isUpload
            ? 'Upload your data to start labeling'
            : 'Use Up/Down arrow key to change value'}
        </p>
      </header>

      <main className={styles.main}>
        {isUpload ? (
          <>
            <UploadGrid />

            {/* Config Section (Dimension Setting & Rating Scale next to each other) */}
            <div className={styles.configSection}>
              {/* Dimension Settings */}
              <div className={styles.configBlock}>
                <span className={styles.configBlockTitle}>🏷️ Dimension Setting</span>
                <div className={styles.tagListContainer}>
                  <div className={styles.tagList}>
                    {dimensions.map((dim, idx) => (
                      <div
                        key={idx}
                        className={`${styles.tagItem} ${activeTagIndex === idx ? styles.tagItemActive : ''}`}
                        onClick={() => setActiveTagIndex(idx)}
                        onDoubleClick={() => setEditingTagIndex(idx)}
                      >
                        {editingTagIndex === idx ? (
                          <input
                            type="text"
                            defaultValue={dim.name}
                            autoFocus
                            onBlur={(e) => handleRenameTag(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameTag(idx, e.currentTarget.value);
                              }
                            }}
                            className={styles.tagRenameInput}
                          />
                        ) : (
                          <span>{dim.name}</span>
                        )}
                        {dimensions.length > 1 && (
                          <button
                            type="button"
                            className={styles.tagRemoveBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(idx);
                            }}
                            title="Remove dimension"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.tagAddBtn}
                      onClick={handleAddTag}
                      title="Add dimension"
                    >
                      +
                    </button>
                  </div>
                  {/* TODO: uncomment this for future uncomment */}
                  {/* <div className={styles.presetButtons}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleValenceArousalPreset}
                      id="btn-preset-va"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      ⚡ Quick Preset: V-A
                    </button>
                  </div> */}
                </div>
              </div>

              {/* Rating Scale Config */}
              <div className={styles.configBlock}>
                <span className={styles.configBlockTitle}>⚙️ Rating Scale Preset ({activeDim.name})</span>

                {/* Trace Presets buttons */}
                <div className={styles.tracePresetRow}>
                  {(['GTrace', 'RankTrace', 'BTrace'] as const).map((preset) => {
                    const isActive = (activeDim.traceType || 'GTrace') === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`${styles.tracePresetBtn} ${isActive ? styles.tracePresetBtnActive : ''}`}
                        onClick={() => handleTracePresetSelect(preset)}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                {/* Subtitle with Definition */}
                <div className={styles.traceDefinition}>
                  Definition: <span>"{getTraceDefinition(activeDim.traceType)}"</span>
                </div>

                <div className={styles.ratingInputs}>
                  {(activeDim.traceType || 'GTrace') === 'GTrace' && (
                    <>
                      <label className={styles.ratingField}>
                        <span>Min</span>
                        <input
                          type="number"
                          value={minStr}
                          onChange={(e) => handleRatingConfigChange('min', e.target.value)}
                          className={styles.ratingInput}
                          id="rating-min"
                        />
                      </label>
                      <label className={styles.ratingField}>
                        <span>Max</span>
                        <input
                          type="number"
                          value={maxStr}
                          onChange={(e) => handleRatingConfigChange('max', e.target.value)}
                          className={styles.ratingInput}
                          id="rating-max"
                        />
                      </label>
                    </>
                  )}

                  {(activeDim.traceType || 'GTrace') !== 'BTrace' && (
                    <label className={styles.ratingField}>
                      <span>Step</span>
                      <input
                        type="number"
                        value={stepStr}
                        step="0.01"
                        min="0.01"
                        onChange={(e) => handleRatingConfigChange('step', e.target.value)}
                        className={styles.ratingInput}
                        id="rating-step"
                      />
                    </label>
                  )}

                  {(activeDim.traceType || 'GTrace') === 'BTrace' && (
                    <div className={styles.btraceBadge}>
                      Min: 0 | Max: 1 | Step: 1 (Fixed)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Metadata & Guided Label Section */}
            <div className={styles.metaAndGuideSection}>
              {/* Metadata (Annotator & Data Sample IDs) */}
              <div className={styles.idConfig}>
                <span className={styles.ratingConfigLabel}>👤 Metadata</span>
                <div className={styles.idInputs}>
                  <label className={styles.idField}>
                    <span>Annotator ID</span>
                    <input
                      type="text"
                      value={annotatorId}
                      onChange={(e) => setAnnotatorId(e.target.value)}
                      className={styles.idInput}
                      placeholder="e.g. A01"
                      id="annotator-id"
                    />
                  </label>
                  <label className={styles.idField}>
                    <span>Data Sample ID</span>
                    <input
                      type="text"
                      value={dataSampleId}
                      onChange={(e) => setDataSampleId(e.target.value)}
                      className={styles.idInput}
                      placeholder="e.g. S001"
                      id="datasample-id"
                    />
                  </label>
                </div>
              </div>

              {/* Execution Mode (Single-Pass vs Gated Multi-Pass) */}
              <div className={styles.executionModeConfig} id="block-execution-mode">
                <span className={styles.ratingConfigLabel}>🔄 Execution Mode</span>
                <div className={styles.executionModeToggleGroup}>
                  <button
                    type="button"
                    className={`${styles.executionModeBtn} ${executionMode === 'gated_multi_pass' ? styles.executionModeBtnActive : ''}`}
                    onClick={() => setExecutionMode('gated_multi_pass')}
                    id="btn-mode-gated"
                    title="Sequential passes per dimension with completion gating"
                  >
                    🔒 Gated Multi-Pass
                  </button>
                  <button
                    type="button"
                    className={`${styles.executionModeBtn} ${executionMode === 'single_pass' ? styles.executionModeBtnActive : ''}`}
                    onClick={() => setExecutionMode('single_pass')}
                    id="btn-mode-single"
                    title="Single-pass mode with free dimension switching"
                  >
                    ⚡ Single-Pass
                  </button>
                </div>
              </div>
            </div>

            {validationError && (
              <div className={styles.validationErrorContainer}>
                <div className={styles.validationError}>
                  <span>⚠️ {validationError}</span>
                </div>
              </div>
            )}

            <div className={styles.startSection}>
              <button
                type="button"
                className={`btn btn-secondary ${styles.quickLoadBtn}`}
                onClick={() => setQuickLoadOpen(true)}
                id="btn-open-quick-load"
              >
                ⚡ Quick Load (.zip / Folder)
              </button>

              <label
                className={`${styles.aiToggleLabel} ${styles.disabled}`}
                title="Fork the repo to configurate"
              >
                <div className={styles.switchWrapper}>
                  <input
                    type="checkbox"
                    id="toggle-use-ai-helper"
                    checked={useAiHelper}
                    onChange={(e) => setUseAiHelper(e.target.checked)}
                    disabled
                  />
                  <span className={styles.switchSlider} />
                </div>
                <span className={styles.aiToggleText}>Use AI helper</span>
              </label>

              <button
                className={`btn btn-primary ${styles.startBtn} ${canStart ? 'animate-glow' : ''}`}
                disabled={!canStart}
                onClick={handleStartSession}
                id="btn-start-session"
              >
                {canStart ? '🚀 Start Labeling Session' : '⏳ Upload data to begin'}
              </button>
            </div>

            <QuickLoadModal
              isOpen={quickLoadOpen}
              onClose={() => setQuickLoadOpen(false)}
            />
          </>
        ) : (
          <SessionView />
        )}
      </main>

      <footer className={styles.footer}>
        <span>Annotation Session Labeler v1.0</span>
        <span className={styles.shortcuts}>
          Home / End Jump • ← → Navigate • ↑ ↓ Rate • Space Play/Pause
        </span>
      </footer>
    </div>
  );
}

