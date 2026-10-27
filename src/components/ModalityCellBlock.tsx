'use client';

import { useState, useRef, useEffect } from 'react';
import type { ModalityCell } from '@/types';
import { useSessionStore } from '@/lib/store';
import { parseCSV } from '@/lib/csv-parser';
import { concatenateAudioFiles } from '@/lib/audio-utils';
import { formatSecondsToString, parseStringToSeconds } from '@/lib/timeline';
import styles from './ModalityCellBlock.module.css';

interface ModalityCellBlockProps {
  cell: ModalityCell;
  index: number;
  totalCells: number;
}

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const CSV_EXTS = new Set(['.csv']);

function getExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

export default function ModalityCellBlock({ cell, index, totalCells }: ModalityCellBlockProps) {
  const { updateModalityCell, removeModalityCell } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [offsetStr, setOffsetStr] = useState(() => formatSecondsToString(cell.skipOffset || 0));

  useEffect(() => {
    setOffsetStr(formatSecondsToString(cell.skipOffset || 0));
  }, [cell.skipOffset]);

  const handleProcessFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setError('');
    setLoading(true);

    try {
      const firstExt = getExt(fileList[0].name);

      if (CSV_EXTS.has(firstExt)) {
        // 1. CSV Telemetry
        const csvFile = fileList[0];
        const res = await parseCSV(csvFile);
        if (res.error) {
          setError(res.error);
        } else {
          updateModalityCell(cell.id, {
            type: 'telemetry',
            name: cell.name.trim() || 'Telemetry Log',
            files: [csvFile],
            telemetryHeaders: res.headers,
            telemetryData: res.data,
            telemetryFileName: csvFile.name,
          });
        }
      } else if (VIDEO_EXTS.has(firstExt)) {
        // 2. Video File
        const videoFile = fileList[0];
        const url = URL.createObjectURL(videoFile);
        updateModalityCell(cell.id, {
          type: 'video',
          name: cell.name.trim() || 'Video Stream',
          files: [videoFile],
          urls: [url],
        });
      } else if (AUDIO_EXTS.has(firstExt)) {
        // 3. Audio File(s)
        const validAudios = fileList.filter((f) => AUDIO_EXTS.has(getExt(f.name)));
        validAudios.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        let finalAudio: File = validAudios[0];
        if (validAudios.length > 1) {
          finalAudio = await concatenateAudioFiles(validAudios);
        }
        const url = URL.createObjectURL(finalAudio);
        updateModalityCell(cell.id, {
          type: 'audio',
          name: cell.name.trim() || 'Audio Stream',
          files: [finalAudio],
          urls: [url],
        });
      } else if (IMAGE_EXTS.has(firstExt)) {
        // 4. Image List
        const validImages = fileList.filter((f) => IMAGE_EXTS.has(getExt(f.name)));
        validImages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const urls = validImages.map((f) => URL.createObjectURL(f));

        updateModalityCell(cell.id, {
          type: 'images',
          name: cell.name.trim() || 'Image Sequence',
          files: validImages,
          urls,
        });
      } else {
        setError(`Unsupported file format "${firstExt}". Use video, audio, image list, or .csv`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to process file(s)');
    } finally {
      setLoading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleProcessFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    handleProcessFiles(files);
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    cell.urls.forEach((u) => URL.revokeObjectURL(u));
    updateModalityCell(cell.id, {
      type: null,
      files: [],
      urls: [],
      telemetryHeaders: undefined,
      telemetryData: undefined,
      telemetryFileName: undefined,
    });
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOffsetStr(val);
    const seconds = parseStringToSeconds(val);
    updateModalityCell(cell.id, { skipOffset: seconds });
  };

  const handleOffsetBlur = () => {
    const seconds = parseStringToSeconds(offsetStr);
    setOffsetStr(formatSecondsToString(seconds));
    updateModalityCell(cell.id, { skipOffset: seconds });
  };

  const isLoaded = cell.type !== null && (cell.files.length > 0 || (cell.telemetryData && cell.telemetryData.length > 0));

  return (
    <div
      className={`${styles.cell} ${isLoaded ? styles.loaded : ''} ${isDragging ? styles.dragOver : ''}`}
      onClick={() => {
        if (!isLoaded) fileInputRef.current?.click();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      id={`block-modality-${cell.id}`}
    >
      {/* Top Header Row for editable Modality Name & Delete Cell */}
      <div className={styles.cellHeader} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          className={styles.nameInput}
          value={cell.name}
          onChange={(e) => updateModalityCell(cell.id, { name: e.target.value })}
          placeholder={`Modality ${index + 1}`}
          title="Click to rename this modality"
        />
        {totalCells > 1 && (
          <button
            type="button"
            className={styles.deleteCellBtn}
            onClick={() => removeModalityCell(cell.id)}
            title="Remove this modality cell"
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.placeholder}>
          <span className={styles.icon}>⏳</span>
          <span className={styles.mainLabel}>Processing file(s)...</span>
        </div>
      ) : isLoaded ? (
        <div className={styles.preview}>
          {cell.type === 'video' && cell.urls[0] && (
            <video src={cell.urls[0]} className={styles.previewMedia} muted />
          )}
          {cell.type === 'images' && cell.urls[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={cell.urls[0]} alt="First frame" className={styles.previewMedia} />
          )}

          {/* Top preview overlay bar */}
          <div className={styles.previewTopBar} onClick={(e) => e.stopPropagation()}>
            <span className={styles.typeBadge}>
              {cell.type === 'video' && '🎬 Video'}
              {cell.type === 'images' && `🖼️ ${cell.files.length} Frames`}
              {cell.type === 'audio' && '🎵 Audio'}
              {cell.type === 'telemetry' && `📊 ${cell.telemetryData?.length || 0} Events`}
            </span>
            <button
              type="button"
              className={styles.removeFileBtn}
              onClick={handleRemoveFile}
              title="Remove uploaded data"
            >
              ✕
            </button>
          </div>

          {/* Center info */}
          <div className={styles.statsCenter}>
            <span className={styles.statIcon}>
              {cell.type === 'video' && '🎬'}
              {cell.type === 'images' && '🖼️'}
              {cell.type === 'audio' && '🎵'}
              {cell.type === 'telemetry' && '📊'}
            </span>
            <span className={styles.statTitle}>{cell.name || 'Loaded'}</span>
            <span className={styles.statDetail}>
              {cell.type === 'telemetry'
                ? cell.telemetryFileName || `${cell.telemetryData?.length} rows`
                : cell.files[0]?.name || ''}
            </span>
          </div>

          {/* Bottom Sync Skip Time container (offset for ANY modality!) */}
          <div className={styles.skipOffsetContainer} onClick={(e) => e.stopPropagation()}>
            <label className={styles.skipOffsetLabel}>
              <span>Sync Skip Time:</span>
              <input
                type="text"
                value={offsetStr}
                onChange={handleOffsetChange}
                onBlur={handleOffsetBlur}
                placeholder="00:00:00"
                className={styles.skipOffsetInput}
                title="Start offset compensation (HH:MM:SS or seconds)"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.icon}>📁</span>
          <span className={styles.mainLabel}>Click or Drop to Upload</span>
          <span className={styles.subLabel}>Auto-detects format from extension</span>
          <div className={styles.formatBadges}>
            <span className={styles.formatBadge}>🎬 Video</span>
            <span className={styles.formatBadge}>🖼️ Image List</span>
            <span className={styles.formatBadge}>🎵 Audio</span>
            <span className={styles.formatBadge}>📊 CSV</span>
          </div>
        </div>
      )}

      {error && <p className={styles.errorText}>{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a,.aac,.flac,.png,.jpg,.jpeg,.webp,.csv"
        multiple
        onChange={handleFileInputChange}
        className="visually-hidden"
      />
    </div>
  );
}
