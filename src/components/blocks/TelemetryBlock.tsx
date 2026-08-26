'use client';

import { useRef, useState } from 'react';
import { useSessionStore } from '@/lib/store';
import { isValidCSV } from '@/lib/validation';
import { parseCSV } from '@/lib/csv-parser';
import styles from './blocks.module.css';

export default function TelemetryBlock() {
  const { telemetryData, setTelemetryData, sessionState } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');

    const validFiles = files.filter(isValidCSV);
    if (validFiles.length === 0) {
      setError('Invalid file. Please select .csv file(s).');
      return;
    }

    // Sort files by name naturally
    validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    setLoading(true);
    let combinedHeaders: string[] = [];
    const combinedData = [];
    const fileNames: string[] = [];

    for (const file of validFiles) {
      fileNames.push(file.name);
      const result = await parseCSV(file);
      if (result.error) {
        setError(`Error parsing ${file.name}: ${result.error}`);
        setLoading(false);
        return;
      }
      if (combinedHeaders.length === 0) {
        combinedHeaders = [...result.headers];
      } else {
        for (const h of result.headers) {
          if (!combinedHeaders.includes(h)) {
            combinedHeaders.push(h);
          }
        }
      }
      combinedData.push(...result.data);
    }
    setLoading(false);

    const fileName = fileNames.length === 1 ? fileNames[0] : fileNames.join(', ');
    setTelemetryData(combinedHeaders, combinedData, fileName);
  };

  const isSession = sessionState === 'active';
  if (isSession) return null; // Rendered by SessionView

  const hasData = telemetryData.length > 0;

  return (
    <button
      className={`${styles.block} ${hasData ? styles.loaded : ''}`}
      onClick={() => fileInputRef.current?.click()}
      id="block-telemetry"
    >
      {loading ? (
        <div className={styles.placeholder}>
          <span className={styles.icon} style={{ animation: 'pulse 1.5s infinite' }}>⏳</span>
          <span className={styles.label}>Parsing CSV...</span>
        </div>
      ) : hasData ? (
        <div className={styles.preview}>
          <div className={styles.previewStats}>
            <span className={styles.icon}>📊</span>
            <span className={styles.label}>Telemetry Log</span>
            <span className={styles.stat}>{telemetryData.length} events</span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.icon}>📊</span>
          <span className={styles.label}>Telemetry Log</span>
          <span className={styles.sublabel}>Click to upload .csv file(s)</span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <input
        id="input-telemetry"
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        onChange={handleFileChange}
        className="visually-hidden"
      />
    </button>
  );
}
