'use client';

import { useRef, useState } from 'react';
import { useSessionStore } from '@/lib/store';
import { isValidAudio } from '@/lib/validation';
import { concatenateAudioFiles } from '@/lib/audio-utils';
import styles from './blocks.module.css';

export default function AudioBlock() {
  const { audioFile, setAudioFile, sessionState } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');

    const validFiles = files.filter(isValidAudio);
    if (validFiles.length === 0) {
      setError('Invalid format. Use .mp3, .wav, .ogg, or .m4a');
      return;
    }

    // Sort by filename naturally
    validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (validFiles.length === 1) {
      setAudioFile(validFiles[0]);
    } else {
      setLoading(true);
      try {
        const combined = await concatenateAudioFiles(validFiles);
        setAudioFile(combined);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to combine audio files');
      } finally {
        setLoading(false);
      }
    }
  };

  const isSession = sessionState === 'active';
  if (isSession) return null; // Rendered by SessionView

  return (
    <button
      className={`${styles.block} ${audioFile ? styles.loaded : ''}`}
      onClick={() => fileInputRef.current?.click()}
      id="block-audio"
    >
      {loading ? (
        <div className={styles.placeholder}>
          <span className={styles.icon} style={{ animation: 'pulse 1.5s infinite' }}>⏳</span>
          <span className={styles.label}>Combining Audio...</span>
        </div>
      ) : audioFile ? (
        <div className={styles.preview}>
          <div className={styles.previewStats}>
            <span className={styles.icon}>🎵</span>
            <span className={styles.label}>Audio Loaded</span>
            <span className={styles.stat}>{audioFile.name}</span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.icon}>🎵</span>
          <span className={styles.label}>Audio File</span>
          <span className={styles.sublabel}>Click to upload audio file(s) for waveform</span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <input
        id="input-audio"
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a"
        multiple
        onChange={handleFileChange}
        className="visually-hidden"
      />
    </button>
  );
}
