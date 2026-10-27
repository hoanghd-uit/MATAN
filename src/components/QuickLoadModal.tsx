'use client';

import { useState, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import { useSessionStore } from '@/lib/store';
import {
  processFolderUpload,
  processZipUpload,
  processDataTransfer,
  type QuickLoadResult,
} from '@/lib/quick-loader';
import styles from './QuickLoadModal.module.css';

interface QuickLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickLoadModal({ isOpen, onClose }: QuickLoadModalProps) {
  const {
    setGameplayMedia,
    setTelemetryData,
    setAudioFile,
    setGamingSpaceMedia,
    setDataSampleId,
    setGuidedLabelData,
    setModalities,
  } = useSessionStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<QuickLoadResult | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleApplyResult = (res: QuickLoadResult) => {
    // 1. Gameplay Media (images)
    setGameplayMedia({
      type: 'images',
      files: res.gameplayFiles,
      urls: res.gameplayFiles.map((f) => URL.createObjectURL(f)),
    });

    // 2. Telemetry Data
    setTelemetryData(res.telemetryHeaders, res.telemetryData, res.telemetryFileName);

    // 3. Audio File
    if (res.audioFile) {
      setAudioFile(res.audioFile);
    }

    // 4. Gaming Space Video (Optional)
    if (res.gamingSpaceFile) {
      setGamingSpaceMedia({
        file: res.gamingSpaceFile,
        url: URL.createObjectURL(res.gamingSpaceFile),
        skipOffset: 0,
      });
    }

    // 5. Populate generic modalities for Responsive Modal Adapter
    const newModalities = [];
    if (res.gameplayFiles && res.gameplayFiles.length > 0) {
      newModalities.push({
        id: 'mod-gameplay',
        name: 'Screen Media (Frames)',
        type: 'images' as const,
        files: res.gameplayFiles,
        urls: res.gameplayFiles.map((f) => URL.createObjectURL(f)),
        skipOffset: 0,
      });
    }
    if (res.telemetryData && res.telemetryData.length > 0) {
      newModalities.push({
        id: 'mod-telemetry',
        name: 'Telemetry Log',
        type: 'telemetry' as const,
        files: [],
        urls: [],
        skipOffset: 0,
        telemetryHeaders: res.telemetryHeaders,
        telemetryData: res.telemetryData,
        telemetryFileName: res.telemetryFileName,
      });
    }
    if (res.audioFile) {
      newModalities.push({
        id: 'mod-audio',
        name: 'Voice Chat',
        type: 'audio' as const,
        files: [res.audioFile],
        urls: [URL.createObjectURL(res.audioFile)],
        skipOffset: 0,
      });
    }
    if (res.gamingSpaceFile) {
      newModalities.push({
        id: 'mod-video',
        name: 'Gaming Space Video',
        type: 'video' as const,
        files: [res.gamingSpaceFile],
        urls: [URL.createObjectURL(res.gamingSpaceFile)],
        skipOffset: 0,
      });
    }

    while (newModalities.length < 4) {
      newModalities.push({
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: '',
        type: null,
        files: [],
        urls: [],
        skipOffset: 0,
      });
    }
    setModalities(newModalities);

    // 6. Guided Label File (Optional)
    if (res.guidedLabelFile && res.guidedLabelHeaders && res.guidedLabelRawData) {
      setGuidedLabelData(
        res.guidedLabelFile,
        res.guidedLabelHeaders,
        res.guidedLabelRawData,
        res.guidedLabelFileName || res.guidedLabelFile.name
      );
    }

    // 7. Data Sample ID
    if (res.dataSampleId) {
      setDataSampleId(res.dataSampleId);
    }
  };

  const handleProgress = (status: string, current?: number, total?: number) => {
    setStatusText(status);
    if (typeof current === 'number' && typeof total === 'number' && total > 0) {
      setProgress({ current, total });
    } else {
      setProgress(null);
    }
  };

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setResult(null);
    try {
      const res = await processFolderUpload(files, handleProgress);
      setResult(res);
      if (res.success) {
        handleApplyResult(res);
      }
    } catch (err: any) {
      setResult({
        success: false,
        gameplayFiles: [],
        telemetryHeaders: [],
        telemetryData: [],
        telemetryFileName: '',
        audioFile: null,
        gamingSpaceFile: null,
        dataSampleId: '',
        errors: [err?.message || 'Failed to process folder'],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setResult(null);
    try {
      const res = await processZipUpload(file, handleProgress);
      setResult(res);
      if (res.success) {
        handleApplyResult(res);
      }
    } catch (err: any) {
      setResult({
        success: false,
        gameplayFiles: [],
        telemetryHeaders: [],
        telemetryData: [],
        telemetryFileName: '',
        audioFile: null,
        gamingSpaceFile: null,
        dataSampleId: '',
        errors: [err?.message || 'Failed to unpack ZIP'],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer) {
      setIsProcessing(true);
      setResult(null);
      try {
        const res = await processDataTransfer(e.dataTransfer, handleProgress);
        setResult(res);
        if (res.success) {
          handleApplyResult(res);
        }
      } catch (err: any) {
        setResult({
          success: false,
          gameplayFiles: [],
          telemetryHeaders: [],
          telemetryData: [],
          telemetryFileName: '',
          audioFile: null,
          gamingSpaceFile: null,
          dataSampleId: '',
          errors: [err?.message || 'Failed to process dropped data'],
          warnings: [],
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleResetModal = () => {
    setResult(null);
    setStatusText('');
    setProgress(null);
  };

  const handleClose = () => {
    handleResetModal();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="⚡ Quick Load Session Dataset">
      <div className={styles.container}>
        <p className={styles.intro}>
          Upload an entire session folder or <code>.zip</code> file. All media and telemetry will be automatically mapped and loaded into the workspace.
        </p>

        <div className={styles.structureHint}>
          📂 Expected: <span>ScreenRecording/</span> (frames) • <span>Telemetry/</span> (.csv) • <span>VoiceChat/</span> (audio) • <span>[video.mp4]</span> (optional)
        </div>

        {isProcessing ? (
          <div className={styles.processingCard}>
            <div className={styles.spinner} />
            <span className={styles.processingStatus}>{statusText || 'Processing files...'}</span>
            {progress && (
              <div className={styles.progressBarContainer}>
                <div
                  className={styles.progressBarFill}
                  style={{
                    width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : result ? (
          <div className={styles.summaryContainer}>
            <div className={styles.summaryList}>
              <div
                className={`${styles.summaryItem} ${result.gameplayFiles.length > 0 ? styles.summaryItemSuccess : styles.summaryItemWarning
                  }`}
              >
                <div className={styles.summaryItemLabel}>
                  <span>🎮</span> Gameplay Media
                </div>
                <span className={styles.summaryItemValue}>
                  {result.gameplayFiles.length > 0
                    ? `✅ ${result.gameplayFiles.length} frames`
                    : '❌ Not found'}
                </span>
              </div>

              <div
                className={`${styles.summaryItem} ${result.telemetryData.length > 0 ? styles.summaryItemSuccess : styles.summaryItemWarning
                  }`}
              >
                <div className={styles.summaryItemLabel}>
                  <span>📊</span> Telemetry Log
                </div>
                <span className={styles.summaryItemValue}>
                  {result.telemetryData.length > 0
                    ? `✅ ${result.telemetryData.length} events (${result.telemetryFileName})`
                    : '❌ Not found'}
                </span>
              </div>

              <div
                className={`${styles.summaryItem} ${result.audioFile ? styles.summaryItemSuccess : styles.summaryItemWarning
                  }`}
              >
                <div className={styles.summaryItemLabel}>
                  <span>🎵</span> VoiceChat Audio
                </div>
                <span className={styles.summaryItemValue}>
                  {result.audioFile ? `✅ ${result.audioFile.name}` : '❌ Not found'}
                </span>
              </div>

              <div
                className={`${styles.summaryItem} ${result.gamingSpaceFile ? styles.summaryItemSuccess : ''
                  }`}
              >
                <div className={styles.summaryItemLabel}>
                  <span>🎥</span> Video Space (Face Cam)
                </div>
                <span className={styles.summaryItemValue}>
                  {result.gamingSpaceFile ? `✅ ${result.gamingSpaceFile.name}` : '⚪ None (optional)'}
                </span>
              </div>

              {result.dataSampleId && (
                <div className={styles.summaryItem}>
                  <div className={styles.summaryItemLabel}>
                    <span>🏷️</span> Data Sample ID
                  </div>
                  <span className={styles.summaryItemValue}>{result.dataSampleId}</span>
                </div>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className={styles.errorsBox}>
                <div className={styles.errorsHeader}>⚠️ Missing or Invalid Required Items</div>
                <ul className={styles.errorsList}>
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.actionsRow}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleResetModal}
              >
                Upload Different File
              </button>
              <button
                type="button"
                className={`btn btn-primary btn-sm ${result.success ? 'animate-glow' : ''}`}
                onClick={handleClose}
              >
                {result.success ? '✅ All Done — View Uploads' : 'Close'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => zipInputRef.current?.click()}
            >
              <span className={styles.dropzoneIcon}>📦</span>
              <span className={styles.dropzoneTitle}>Drag & drop Folder or .ZIP file here</span>
              <span className={styles.dropzoneSubtitle}>or click to select a .ZIP file</span>
            </div>

            <div className={styles.divider}>or choose manually</div>

            <div className={styles.buttonGroup}>
              <button
                type="button"
                className={`btn btn-secondary ${styles.selectBtn}`}
                onClick={() => folderInputRef.current?.click()}
                id="btn-quick-load-folder"
              >
                📁 Select Folder
              </button>
              <button
                type="button"
                className={`btn btn-primary ${styles.selectBtn}`}
                onClick={() => zipInputRef.current?.click()}
                id="btn-quick-load-zip"
              >
                📦 Select .ZIP File
              </button>
            </div>

            {/* Hidden Folder Input */}
            <input
              id="input-quick-load-folder"
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              onChange={handleFolderChange}
              className="visually-hidden"
            />

            {/* Hidden Zip Input */}
            <input
              id="input-quick-load-zip"
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,multipart/x-zip"
              onChange={handleZipChange}
              className="visually-hidden"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
