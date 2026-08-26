'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import styles from './page.module.css';
import Link from 'next/link';
import { calculateKrippendorff, ScaleType, KrippendorffResult } from '@/lib/krippendorff';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  rowCount: number;
  columns: string[];
  dimensions: string[];
  data: any[];
  error?: string;
}

export default function ResearcherAgreementPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [agreementColumns, setAgreementColumns] = useState<string[]>([]);
  const [manualColumnInput, setManualColumnInput] = useState('');
  const [scaleType, setScaleType] = useState<ScaleType>('INTERVAL');

  const [isDragging, setIsDragging] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState<Record<string, KrippendorffResult> | null>(null);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [filesListOpen, setFilesListOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically detect common columns that differ across uploaded files
  useEffect(() => {
    if (uploadedFiles.length < 2) {
      setAgreementColumns([]);
      setResults(null);
      return;
    }

    // Get all columns from the first file
    const firstFileCols = uploadedFiles[0].columns;

    // Find columns that exist in all uploaded files (common columns)
    const commonCols = firstFileCols.filter((col) =>
      uploadedFiles.every((f) => f.columns.includes(col))
    );

    // Identify and skip the timestamp column
    const timestampCol =
      commonCols.find((h) => h.toLowerCase().includes('timestamp')) || '[control]timestamp_unix';
    const colsToCheck = commonCols.filter((col) => col !== timestampCol);

    // Check which columns have different values across the files
    const differingCols: string[] = [];
    colsToCheck.forEach((col) => {
      let differs = false;
      const rowCount = Math.min(...uploadedFiles.map((f) => f.data.length));

      for (let r = 0; r < rowCount; r++) {
        const val0 = uploadedFiles[0].data[r]?.[col];
        for (let fIdx = 1; fIdx < uploadedFiles.length; fIdx++) {
          if (uploadedFiles[fIdx].data[r]?.[col] !== val0) {
            differs = true;
            break;
          }
        }
        if (differs) break;
      }

      if (differs) {
        differingCols.push(col);
      }
    });

    setAgreementColumns(differingCols);
    setResults(null); // Clear old results if file state changes
  }, [uploadedFiles]);

  // Helper to parse a single CSV file
  const processFile = (file: File): Promise<UploadedFile> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];

          // Detect timestamp column
          const timestampCol = headers.find((h) => h.toLowerCase().includes('timestamp')) || '[control]timestamp_unix';

          // Find standard dimension rating columns (not timestamp, not telemetry namespaces starting with '[')
          let detectedDims = headers.filter(
            (h) => !h.toLowerCase().includes('timestamp') && !h.startsWith('[')
          );

          if (detectedDims.length === 0) {
            detectedDims = headers.filter((h) => h !== timestampCol);
          }

          resolve({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            size: file.size,
            rowCount: results.data.length,
            columns: headers,
            dimensions: detectedDims,
            data: results.data,
          });
        },
        error: (err) => {
          resolve({
            id: `${file.name}-${Date.now()}`,
            name: file.name,
            size: file.size,
            rowCount: 0,
            columns: [],
            dimensions: [],
            data: [],
            error: err.message,
          });
        },
      });
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const parsed = await processFile(file);
        newFiles.push(parsed);
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    setUploadedFiles([]);
    setAgreementColumns([]);
    setResults(null);
  };

  const handleCalculateKrippendorff = () => {
    if (uploadedFiles.length < 2 || agreementColumns.length === 0) return;
    setIsCalculating(true);

    setTimeout(() => {
      try {
        const T = Math.min(...uploadedFiles.map((f) => f.data.length));
        const computedResults: Record<string, KrippendorffResult> = {};

        agreementColumns.forEach((col) => {
          // Construct the rater matrix: raterMatrix[r][u]
          const raterMatrix: (number | null)[][] = uploadedFiles.map((file) => {
            return Array.from({ length: T }, (_, u) => {
              const val = file.data[u]?.[col];
              if (val === undefined || val === null || val === '') return null;
              const parsed = parseFloat(val);
              return isNaN(parsed) ? null : parsed;
            });
          });

          computedResults[col] = calculateKrippendorff({
            raterMatrix,
            scale: scaleType,
          });
        });

        setResults(computedResults);
      } catch (err: any) {
        console.error('[Krippendorff Error]', err);
        alert(`Krippendorff calculation failed: ${err.message}`);
      } finally {
        setIsCalculating(false);
      }
    }, 400);
  };

  const handleAddManualColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const colName = manualColumnInput.trim();
    if (!colName) return;

    if (agreementColumns.includes(colName)) {
      alert(`Column "${colName}" is already selected.`);
      return;
    }

    const existsInAll = uploadedFiles.every((f) => f.columns.includes(colName));
    if (!existsInAll) {
      alert(`Column "${colName}" does not exist in all uploaded CSV files.`);
      return;
    }

    setAgreementColumns((prev) => [...prev, colName]);
    setManualColumnInput('');
    setResults(null);
  };

  const removeAgreementColumn = (colName: string) => {
    setAgreementColumns((prev) => prev.filter((c) => c !== colName));
    setResults(null);
  };

  const getReliabilityClass = (alpha: number) => {
    if (alpha === 1.0) return styles.reliabilityPerfect;
    if (alpha >= 0.80) return styles.reliabilityHigh;
    if (alpha >= 0.67) return styles.reliabilityTentative;
    if (alpha > 0.0) return styles.reliabilityLow;
    return styles.reliabilityChance;
  };

  const getReliabilityBadgeClass = (alpha: number) => {
    if (alpha === 1.0) return styles.badgePerfect;
    if (alpha >= 0.80) return styles.badgeHigh;
    if (alpha >= 0.67) return styles.badgeTentative;
    if (alpha > 0.0) return styles.badgeLow;
    return styles.badgeChance;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>📊</span>
            Krippendorff's Alpha
          </h1>
          {uploadedFiles.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={clearAll}>
              Clear All
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          Calculate inter-rater reliability among multiple annotator CSV output files based on Nominal, Ordinal, Interval, or Ratio measurement scales.
        </p>
      </header>

      <main className={styles.main}>
        {/* Upload Block */}
        <div
          className={`${styles.uploadBlock} ${isDragging ? styles.dragOver : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className={styles.uploadContentHorizontal}>
            <div className={styles.uploadIcon}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className={styles.uploadTextContainer}>
              <div className={styles.uploadTextRow}>
                <h3 className={styles.uploadTitle}>Upload annotator output CSV files</h3>
                <span className={styles.uploadLimit}>Supports N CSV files with matching header columns</span>
              </div>
              <p className={styles.uploadSub}>
                Drag & drop multiple CSVs here, or click to browse
              </p>
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            multiple
            className="visually-hidden"
          />
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <section className={styles.filesSection}>
            <div className={styles.sectionHeader} onClick={() => setFilesListOpen(!filesListOpen)}>
              <h2 className={styles.sectionTitle}>
                Uploaded Files ({uploadedFiles.length})
              </h2>
              <span className={styles.collapseArrow}>
                {filesListOpen ? '▲' : '▼'}
              </span>
            </div>

            {filesListOpen && (
              <div className={styles.filesList}>
                {uploadedFiles.map((file) => (
                  <div key={file.id} className={styles.fileCard}>
                    <div className={styles.fileCardMain}>
                      <div className={styles.fileIcon}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                          <path d="M9 15h6" />
                          <path d="M9 11h6" />
                        </svg>
                      </div>
                      <div className={styles.fileMeta}>
                        <h4 className={styles.fileName}>{file.name}</h4>
                        <span className={styles.fileSize}>
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                        title="Remove file"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {file.error ? (
                      <div className={styles.fileError}>⚠️ Error: {file.error}</div>
                    ) : (
                      <div className={styles.fileStats}>
                        <div className={styles.statCell}>
                          <span className={styles.statLabel}>Rows</span>
                          <span className={styles.statVal}>{file.rowCount}</span>
                        </div>
                        <div className={styles.statCell}>
                          <span className={styles.statLabel}>CSV Columns</span>
                          <div className={styles.dimBadges}>
                            {file.columns.map((col) => (
                              <span key={col} className={styles.dimBadge}>
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Agreement Columns Tags block */}
            <div className={styles.columnsBlock}>
              <span className={styles.blockLabel}>Columns involved in reliability calculation</span>
              <div className={styles.chipsRow}>
                {agreementColumns.map((col) => (
                  <span key={col} className={styles.columnChip}>
                    {col}
                    <button
                      type="button"
                      className={styles.removeChipBtn}
                      onClick={() => removeAgreementColumn(col)}
                      title={`Exclude ${col}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}

                <form onSubmit={handleAddManualColumn} className={styles.addColumnForm}>
                  <input
                    type="text"
                    placeholder="Add column..."
                    value={manualColumnInput}
                    onChange={(e) => setManualColumnInput(e.target.value)}
                    className={styles.addColumnInput}
                  />
                  <button type="submit" className={styles.addColumnBtn}>
                    +
                  </button>
                </form>
              </div>
              {agreementColumns.length === 0 && (
                <p className={styles.noColumnsWarn}>
                  ⚠️ No columns selected. Upload files with differing values or type column names manually to enable calculation.
                </p>
              )}
            </div>

            {/* Scale Type Selector Block */}
            <div className={styles.scaleSelector}>
              <span className={styles.blockLabel}>Measurement Scale Selection</span>
              <div className={styles.scaleOptions}>
                {([
                  { value: 'NOMINAL', label: 'Nominal Scale', desc: 'Classification / categorical tags. Distance is binary (agrees or disagrees).' },
                  { value: 'ORDINAL', label: 'Ordinal Scale', desc: 'Rankings / ordered states. Considers distances based on marginal frequencies.' },
                  { value: 'INTERVAL', label: 'Interval Scale', desc: 'Linear continuous values (default). Considers squared difference (v - v\')².' },
                  { value: 'RATIO', label: 'Ratio Scale', desc: 'Non-negative values with absolute zero. Considers relative squared difference.' },
                ] as { value: ScaleType; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.scaleOption} ${scaleType === opt.value ? styles.scaleOptionActive : ''}`}
                    onClick={() => {
                      setScaleType(opt.value);
                      setResults(null); // Clear summary to force recalculation
                    }}
                  >
                    <span className={styles.scaleOptionLabel}>{opt.label}</span>
                    <span className={styles.scaleOptionDesc}>{opt.desc}</span>
                    {opt.value === 'INTERVAL' && (
                      <span className={styles.defaultBadge}>Default</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculate Button */}
            <div className={styles.actionBlock}>
              <button
                className={`btn btn-primary ${styles.analyzeBtn} ${
                  uploadedFiles.length >= 2 && agreementColumns.length > 0 ? 'animate-glow' : ''
                }`}
                disabled={uploadedFiles.length < 2 || agreementColumns.length === 0 || isCalculating}
                onClick={handleCalculateKrippendorff}
              >
                {isCalculating ? (
                  <>
                    <span className={styles.spinner} />
                    Calculating Krippendorff...
                  </>
                ) : (
                  '📊 Calculate Krippendorff\'s Alpha'
                )}
              </button>
              {uploadedFiles.length < 2 && (
                <p className={styles.actionHint}>
                  Upload at least 2 CSV files to begin reliability calculation.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Results Panel */}
        {results && (
          <section className={`${styles.resultsSection} animate-slideUp`}>
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultTitle}>Reliability Calculation Results</h3>
                <span className={styles.successBadge}>Computation Complete</span>
              </div>

              <div className={styles.resultContent}>
                <p className={styles.resultText}>
                  Krippendorff's Alpha (α) has been calculated using the <strong>{scaleType}</strong> scale type. Below are the reliability scores for the selected columns:
                </p>

                {/* Score Cards Grid */}
                <div className={styles.resultsGrid}>
                  {Object.entries(results).map(([col, res]) => (
                    <div key={col} className={`${styles.alphaCard} ${getReliabilityClass(res.alpha)}`}>
                      <div className={styles.alphaCardHeader}>
                        <span className={styles.alphaColName}>{col}</span>
                        <span className={`${styles.alphaInterpretation} ${getReliabilityBadgeClass(res.alpha)}`}>
                          {res.interpretation}
                        </span>
                      </div>
                      <div className={styles.alphaScore}>
                        {res.alpha.toFixed(4)}
                      </div>
                      <div className={styles.doDeRow}>
                        <div>
                          <span className={styles.doDeLabel}>D_o: </span>
                          <span className={styles.doDeVal}>{res.Do.toFixed(5)}</span>
                        </div>
                        <div>
                          <span className={styles.doDeLabel}>D_e: </span>
                          <span className={styles.doDeVal}>{res.De.toFixed(5)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Detailed Table Breakdown */}
                <div className={styles.detailsSection}>
                  <h4 className={styles.detailsTitle}>Summary Statistics Breakdown</h4>
                  <div className={styles.tableContainer}>
                    <table className={styles.summaryTable}>
                      <thead>
                        <tr>
                          <th>Target Column</th>
                          <th>Scale</th>
                          <th>Alpha (α)</th>
                          <th>Observed Disagreement (D_o)</th>
                          <th>Expected Disagreement (D_e)</th>
                          <th>Pairable Values (n)</th>
                          <th>Valid Units (U)</th>
                          <th>Raters (R)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(results).map(([col, res]) => (
                          <tr key={col}>
                            <td><strong>{col}</strong></td>
                            <td>{res.scale}</td>
                            <td>
                              <span className={`${styles.tableBadge} ${getReliabilityBadgeClass(res.alpha)}`}>
                                {res.alpha.toFixed(4)}
                              </span>
                            </td>
                            <td>{res.Do.toFixed(5)}</td>
                            <td>{res.De.toFixed(5)}</td>
                            <td>{res.pairedCount}</td>
                            <td>{res.unitCount}</td>
                            <td>{res.raterCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Accordion: Theoretical Formulas */}
                <div className={styles.accordion}>
                  <button
                    className={styles.accordionHeader}
                    onClick={() => setAccordionOpen(!accordionOpen)}
                  >
                    <span>ℹ️ Theoretical Formulas & Benchmarks</span>
                    <span className={`${styles.accordionArrow} ${accordionOpen ? styles.accordionArrowOpen : ''}`}>
                      ▼
                    </span>
                  </button>
                  {accordionOpen && (
                    <div className={styles.accordionContent}>
                      <p>
                        Krippendorff's Alpha is calculated by comparing observed disagreement to the expected disagreement:
                      </p>
                      <div className={styles.formulaBlock}>
                        alpha = 1 - (D_o / D_e)
                      </div>
                      <p>
                        <strong>Interpretation benchmarks (α):</strong>
                      </p>
                      <ul>
                        <li><strong>α &ge; 0.80:</strong> High Reliability. Standard benchmark for relying on data without reservation.</li>
                        <li><strong>0.67 &le; α &lt; 0.80:</strong> Tentative Reliability. Acceptable for exploratory analysis.</li>
                        <li><strong>0.0 &lt; α &lt; 0.67:</strong> Low Reliability. Systemic disagreement or high noise.</li>
                        <li><strong>α &le; 0.0:</strong> Opposing Agreement. Raters actively contradict each other more than random chance.</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <Link href="/" className={styles.backLink}>
          ← Back to Annotator Workspace
        </Link>
        <span>Krippendorff's Alpha v1.0</span>
      </footer>
    </div>
  );
}
