'use client';

import GameplayBlock from '@/components/blocks/GameplayBlock';
import GamingSpaceBlock from '@/components/blocks/GamingSpaceBlock';
import TelemetryBlock from '@/components/blocks/TelemetryBlock';
import AudioBlock from '@/components/blocks/AudioBlock';
import styles from './UploadGrid.module.css';

export default function UploadGrid() {
  return (
    <div className={styles.grid} id="upload-grid">
      <GameplayBlock />
      <GamingSpaceBlock />
      <TelemetryBlock />
      <AudioBlock />
    </div>
  );
}
