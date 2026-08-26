'use client';

import { useRef, useState } from 'react';
import { useSessionStore } from '@/lib/store';
import { isValidVideo } from '@/lib/validation';
import { parseStringToSeconds, formatSecondsToString } from '@/lib/timeline';
import styles from './blocks.module.css';

export default function GamingSpaceBlock() {
  const { gamingSpaceMedia, setGamingSpaceMedia, updateGamingSpaceSkipOffset, sessionState } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [offsetStr, setOffsetStr] = useState(() =>
    gamingSpaceMedia ? formatSecondsToString(gamingSpaceMedia.skipOffset) : '00:00:00'
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!isValidVideo(file)) {
      setError('Invalid video format. Use .mp4, .webm, or .mov');
      return;
    }

    setGamingSpaceMedia({
      file,
      url: URL.createObjectURL(file),
      skipOffset: parseStringToSeconds(offsetStr),
    });
  };

  const handleOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOffsetStr(val);
    const seconds = parseStringToSeconds(val);
    updateGamingSpaceSkipOffset(seconds);
  };

  const handleOffsetBlur = () => {
    const seconds = parseStringToSeconds(offsetStr);
    setOffsetStr(formatSecondsToString(seconds));
    updateGamingSpaceSkipOffset(seconds);
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGamingSpaceMedia(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isSession = sessionState === 'active';
  if (isSession) return null; // Rendered by SessionView

  return (
    <div
      className={`${styles.block} ${gamingSpaceMedia ? styles.loaded : ''}`}
      onClick={() => fileInputRef.current?.click()}
      id="block-gaming-space"
      key={gamingSpaceMedia?.url || 'empty'}
    >
      {gamingSpaceMedia ? (
        <div className={styles.preview}>
          <video src={gamingSpaceMedia.url} className={styles.previewMedia} muted />
          <div className={styles.previewBadgeContainer}>
            <span className={styles.previewBadge}>🎥 Video Space</span>
            <button
              className={styles.removeBtn}
              onClick={handleRemoveFile}
              title="Remove video"
            >
              ✕
            </button>
          </div>

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
              />
            </label>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.icon}>🎥</span>
          <span className={styles.label}>Video Space</span>
          <span className={styles.sublabel}>Optional — Click to upload face cam video</span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <input
        id="input-gaming-space"
        ref={fileInputRef}
        type="file"
        accept=".mp4,.webm,.mov"
        onChange={handleFileChange}
        className="visually-hidden"
      />
    </div>
  );
}
