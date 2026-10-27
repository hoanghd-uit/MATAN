'use client';

import { useSessionStore } from '@/lib/store';
import ModalityCellBlock from '@/components/ModalityCellBlock';
import styles from './UploadGrid.module.css';

export default function UploadGrid() {
  const { modalities, addModalityCell } = useSessionStore();

  return (
    <div className={styles.container}>
      <div className={styles.grid} id="upload-grid">
        {modalities.map((cell, index) => (
          <ModalityCellBlock
            key={cell.id}
            cell={cell}
            index={index}
            totalCells={modalities.length}
          />
        ))}
      </div>

      <button
        type="button"
        className={styles.addCellBtn}
        onClick={addModalityCell}
        id="btn-add-modality-cell"
        title="Add an additional modality cell"
      >
        <span>➕ Add Modality Cell ({modalities.length} active)</span>
      </button>
    </div>
  );
}
