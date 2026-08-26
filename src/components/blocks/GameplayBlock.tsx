'use client';

import { useState, useRef } from 'react';
import { useSessionStore } from '@/lib/store';
import { isValidVideo, isValidImage } from '@/lib/validation';
import Modal from '@/components/ui/Modal';
import styles from './blocks.module.css';

export default function GameplayBlock() {
  const { gameplayMedia, setGameplayMedia, sessionState } = useSessionStore();
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMode, setUploadMode] = useState<'video' | 'images'>('images');
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');

    if (uploadMode === 'video') {
      const file = files[0];
      if (!isValidVideo(file)) {
        setError('Invalid video format. Use .mp4, .webm, or .mov');
        return;
      }
      setGameplayMedia({
        type: 'video',
        files: [file],
        urls: [URL.createObjectURL(file)],
      });
    } else {
      const validFiles = files.filter(isValidImage);
      if (validFiles.length === 0) {
        setError('No valid images. Use .png, .jpg, .jpeg, or .webp');
        return;
      }
      // Sort by filename (which may contain timestamps)
      validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setGameplayMedia({
        type: 'images',
        files: validFiles,
        urls: validFiles.map((f) => URL.createObjectURL(f)),
      });
    }
    setModalOpen(false);
  };

  const isSession = sessionState === 'active';

  if (isSession && gameplayMedia) {
    return null; // Rendered by SessionView
  }

  return (
    <>
      <button
        className={`${styles.block} ${gameplayMedia ? styles.loaded : ''}`}
        onClick={() => setModalOpen(true)}
        id="block-gameplay"
      >
        {gameplayMedia ? (
          <div className={styles.preview}>
            {gameplayMedia.type === 'video' ? (
              <video src={gameplayMedia.urls[0]} className={styles.previewMedia} muted />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={gameplayMedia.urls[0]}
                alt="First frame"
                className={styles.previewMedia}
              />
            )}
            <div className={styles.previewBadge}>
              {gameplayMedia.type === 'video'
                ? '🎬 Video'
                : `🖼️ ${gameplayMedia.files.length} images`}
            </div>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.icon}>🎥</span>
            <span className={styles.label}>Video Media</span>
            <span className={styles.sublabel}>Click to upload video or images</span>
          </div>
        )}
      </button>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Upload Video Media">
        <div className={styles.modalContent}>
          <div className={styles.toggleGroup}>
            <button
              className={`${styles.toggleBtn} ${uploadMode === 'images' ? styles.active : ''}`}
              onClick={() => setUploadMode('images')}
            >
              🖼️ Image List
            </button>
            <button
              className={`${styles.toggleBtn} ${uploadMode === 'video' ? styles.active : ''}`}
              onClick={() => setUploadMode('video')}
            >
              🎬 Video
            </button>
          </div>

          <button
            className={`btn btn-primary ${styles.uploadBtn}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMode === 'video' ? 'Choose Video File' : 'Choose Image Files'}
          </button>

          <input
            id="input-gameplay"
            ref={fileInputRef}
            type="file"
            accept={uploadMode === 'video' ? '.mp4,.webm,.mov' : '.png,.jpg,.jpeg,.webp'}
            multiple={uploadMode === 'images'}
            onChange={handleFileChange}
            className="visually-hidden"
          />

          {error && <p className={styles.error}>{error}</p>}

          <p className={styles.hint}>
            {uploadMode === 'video'
              ? 'Supported: .mp4, .webm, .mov'
              : 'Supported: .png, .jpg, .jpeg, .webp — Select multiple files'}
          </p>
        </div>
      </Modal>
    </>
  );
}
