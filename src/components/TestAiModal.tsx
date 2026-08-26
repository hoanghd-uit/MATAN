'use client';

import { useState, useEffect, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import { useSessionStore } from '@/lib/store';
import { isValidAudio } from '@/lib/validation';
import styles from './TestAiModal.module.css';

interface ShiftItem {
  timestamp_sec: number;
  'prev_VA (V,A)'?: [number, number];
  prev_VA?: [number, number];
  'new_VA (V,A)'?: [number, number];
  new_VA?: [number, number];
  delta: number;
}

interface AudioDetectionResponse {
  status: string;
  source: string;
  window_sec: number;
  stride_sec: number;
  a_thresh: number;
  total_shifts: number;
  audio_shifts: ShiftItem[];
}

interface TestAiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_API_URL = 'http://34.142.166.83:8000/detect/audio';

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export default function TestAiModal({ isOpen, onClose }: TestAiModalProps) {
  const { audioFile, setAudioFile } = useSessionStore();

  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [thresh, setThresh] = useState<number>(0.35);
  const [windowSec, setWindowSec] = useState<number>(1.0);
  const [strideSec, setStrideSec] = useState<number>(0.25);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState<AudioDetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState<number | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto trigger detection when modal opens if an audio file is loaded and no result yet
  useEffect(() => {
    if (isOpen && audioFile && !result && !isLoading && !error) {
      runDetection();
    }
  }, [isOpen]);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidAudio(file)) {
      setError('Invalid audio format. Please upload .wav, .mp3, .ogg, or .m4a');
      return;
    }

    setAudioFile(file);
    setError(null);
    setResult(null);
  };

  const runDetection = async (overrideThresh?: number) => {
    if (!audioFile) {
      setError('No audio file found. Please upload an audio file in Voice Chat source first.');
      return;
    }

    const activeThresh = overrideThresh !== undefined ? overrideThresh : thresh;
    if (overrideThresh !== undefined) {
      setThresh(overrideThresh);
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setLoadingStep('Uploading audio & connecting to AI model...');

    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('a_thresh', String(activeThresh));
      formData.append('window_sec', String(windowSec));
      formData.append('stride_sec', String(strideSec));

      setLoadingStep('Analyzing speech emotion shifts in continuous V-A space...');

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = `Server returned status ${response.status} (${response.statusText})`;
        try {
          const errJson = await response.json();
          if (errJson.detail) {
            errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // ignore parsing error
        }
        throw new Error(errorDetail);
      }

      const data: AudioDetectionResponse = await response.json();
      const endTime = performance.now();
      setElapsedTimeMs(Math.round(endTime - startTime));
      setResult(data);
    } catch (err: any) {
      const endTime = performance.now();
      setElapsedTimeMs(Math.round(endTime - startTime));
      setError(err?.message || 'Failed to connect to AI server. Please check your network connection.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleCopyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    if (!result || !result.audio_shifts.length) return;

    const headers = ['Timestamp_sec', 'Time_Formatted', 'Prev_Valence', 'Prev_Arousal', 'New_Valence', 'New_Arousal', 'Delta'];
    const rows = result.audio_shifts.map((s) => {
      const prev = s['prev_VA (V,A)'] || s.prev_VA || [0, 0];
      const next = s['new_VA (V,A)'] || s.new_VA || [0, 0];
      return [
        s.timestamp_sec,
        formatTimestamp(s.timestamp_sec),
        prev[0],
        prev[1],
        next[0],
        next[1],
        s.delta,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai_emotion_shifts_${audioFile?.name || 'audio'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!result) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `ai_emotion_shifts_${audioFile?.name || 'audio'}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🤖 AI Emotion Shift Detection (Test AI)">
      <div className={styles.container}>
        {/* Endpoint Banner */}
        <div className={styles.endpointBanner}>
          <div>
            <span className={styles.endpointMethod}>POST</span>
            <span className={styles.endpointUrl}>{apiUrl}</span>
          </div>
          <span className={styles.serverBadge}>
            <span className={styles.serverBadgeDot} />
            FastAPI Live
          </span>
        </div>

        {/* Audio Source Status */}
        {audioFile ? (
          <div className={styles.audioSourceCard}>
            <div className={styles.audioInfo}>
              <span className={styles.audioIcon}>🎵</span>
              <div className={styles.audioDetails}>
                <span className={styles.audioTitle}>{audioFile.name}</span>
                <span className={styles.audioMeta}>
                  Voice Chat Track • {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • {audioFile.type || 'audio/wav'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Replace Audio
            </button>
          </div>
        ) : (
          <div className={styles.noAudioWarning}>
            <span>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong>No Voice Chat audio loaded yet.</strong>
              <div style={{ fontSize: '12px', marginTop: '2px' }}>
                Please select an audio file to test continuous emotion shift detection.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Audio
            </button>
          </div>
        )}

        {/* Hidden File Input for quick upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a"
          onChange={handleAudioUpload}
          className="visually-hidden"
        />

        {/* Configuration Parameters */}
        <div className={styles.configSection}>
          <div
            className={styles.configHeader}
            onClick={() => setShowConfig(!showConfig)}
          >
            <span className={styles.configTitle}>
              ⚙️ Detection Parameters {showConfig ? '▲' : '▼'}
            </span>
            <div className={styles.presetPills} onClick={(e) => e.stopPropagation()}>
              <span
                className={`${styles.presetPill} ${thresh === 0.05 ? styles.presetPillActive : ''}`}
                onClick={() => setThresh(0.05)}
              >
                High Sens (0.05)
              </span>
              <span
                className={`${styles.presetPill} ${thresh === 0.2 ? styles.presetPillActive : ''}`}
                onClick={() => setThresh(0.2)}
              >
                Medium (0.20)
              </span>
              <span
                className={`${styles.presetPill} ${thresh === 0.35 ? styles.presetPillActive : ''}`}
                onClick={() => setThresh(0.35)}
              >
                Standard (0.35)
              </span>
            </div>
          </div>

          {showConfig && (
            <div className={styles.configGrid}>
              <label className={styles.configField}>
                <span className={styles.configLabel}>Threshold (a_thresh)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  max="2.0"
                  value={thresh}
                  onChange={(e) => setThresh(parseFloat(e.target.value) || 0.35)}
                  className={styles.configInput}
                />
              </label>
              <label className={styles.configField}>
                <span className={styles.configLabel}>Window (window_sec)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="10.0"
                  value={windowSec}
                  onChange={(e) => setWindowSec(parseFloat(e.target.value) || 1.0)}
                  className={styles.configInput}
                />
              </label>
              <label className={styles.configField}>
                <span className={styles.configLabel}>Stride (stride_sec)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="5.0"
                  value={strideSec}
                  onChange={(e) => setStrideSec(parseFloat(e.target.value) || 0.25)}
                  className={styles.configInput}
                />
              </label>
              <label className={styles.configField} style={{ gridColumn: 'span 2' }}>
                <span className={styles.configLabel}>Server Endpoint URL</span>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className={styles.configInput}
                />
              </label>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className={styles.actionsRow}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={`${styles.runBtn} ${!isLoading && audioFile ? 'animate-glow' : ''}`}
            disabled={isLoading || !audioFile}
            onClick={() => runDetection()}
            id="btn-run-ai-detect"
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>{result ? 'Re-run AI Detection' : 'Run AI Detection'}</span>
              </>
            )}
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className={styles.loadingCard}>
            <div className={styles.spinner} />
            <div className={styles.loadingText}>{loadingStep || 'Calling AI Server...'}</div>
            <div className={styles.loadingSubtext}>Model: DistilHuBERT SER INT8 ONNX (Valence & Arousal)</div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className={styles.errorCard}>
            <div className={styles.errorTitle}>
              <span>❌</span> Error Processing Audio
            </div>
            <div className={styles.errorDetail}>{error}</div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'flex-start', marginTop: '6px' }}
              onClick={() => runDetection()}
            >
              🔄 Retry Request
            </button>
          </div>
        )}

        {/* Results State */}
        {result && !isLoading && (
          <div className={styles.resultsContainer}>
            {/* Stats Cards */}
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Total Shifts</span>
                <span className={`${styles.statValue} ${result.total_shifts > 0 ? styles.statValueSuccess : ''}`}>
                  {result.total_shifts}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Threshold (Δ)</span>
                <span className={styles.statValue}>{result.a_thresh}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Window / Stride</span>
                <span className={styles.statValue}>
                  {result.window_sec}s / {result.stride_sec}s
                </span>
              </div>
              {elapsedTimeMs !== null && (
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Latency</span>
                  <span className={styles.statValue}>{elapsedTimeMs} ms</span>
                </div>
              )}
            </div>

            {/* Shifts Table or Empty Message */}
            {result.audio_shifts && result.audio_shifts.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    📍 Detected Emotion Shift Events ({result.audio_shifts.length})
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleExportCSV}
                    >
                      📥 CSV
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleExportJSON}
                    >
                      📥 JSON
                    </button>
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.shiftsTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Timestamp</th>
                        <th>Previous (V, A)</th>
                        <th>New (V, A)</th>
                        <th>Delta (Δ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.audio_shifts.map((shift, idx) => {
                        const prev = shift['prev_VA (V,A)'] || shift.prev_VA || [0, 0];
                        const next = shift['new_VA (V,A)'] || shift.new_VA || [0, 0];
                        return (
                          <tr key={idx}>
                            <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                            <td>
                              <div className={styles.timeCell}>
                                <span className={styles.timeSec}>{shift.timestamp_sec.toFixed(2)}s</span>
                                <span className={styles.timeFmt}>{formatTimestamp(shift.timestamp_sec)}</span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.vaChipGroup}>
                                <span className={`${styles.vaChip} ${styles.vaChipV}`}>
                                  V: {prev[0] > 0 ? `+${prev[0].toFixed(3)}` : prev[0].toFixed(3)}
                                </span>
                                <span className={`${styles.vaChip} ${styles.vaChipA}`}>
                                  A: {prev[1] > 0 ? `+${prev[1].toFixed(3)}` : prev[1].toFixed(3)}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.vaChipGroup}>
                                <span className={`${styles.vaChip} ${styles.vaChipV}`}>
                                  V: {next[0] > 0 ? `+${next[0].toFixed(3)}` : next[0].toFixed(3)}
                                </span>
                                <span className={`${styles.vaChip} ${styles.vaChipA}`}>
                                  A: {next[1] > 0 ? `+${next[1].toFixed(3)}` : next[1].toFixed(3)}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={styles.deltaBadge}>
                                Δ {shift.delta.toFixed(3)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className={styles.emptyShiftsBox}>
                <span style={{ fontSize: '24px' }}>🎯</span>
                <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  No emotional shifts exceeded threshold Δ {result.a_thresh}
                </strong>
                <p className={styles.emptyShiftsText}>
                  The audio has stable or subtle emotional variance. Try running with a more sensitive threshold to detect smaller changes.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => runDetection(0.05)}
                  >
                    ⚡ Test High Sensitivity (0.05)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => runDetection(0.1)}
                  >
                    ⚡ Test Sensitivity (0.10)
                  </button>
                </div>
              </div>
            )}

            {/* Raw JSON Toggle & Viewer */}
            <div>
              <button
                type="button"
                className={styles.jsonToggle}
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? '▼ Hide Raw JSON Response' : '▶ Show Raw JSON Response'}
              </button>

              {showRawJson && (
                <div className={styles.jsonBox}>
                  <button
                    type="button"
                    className={styles.copyJsonBtn}
                    onClick={handleCopyJson}
                  >
                    {copied ? '✅ Copied' : '📋 Copy JSON'}
                  </button>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
