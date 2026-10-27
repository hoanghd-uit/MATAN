'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import styles from './page.module.css';
import Link from 'next/link';
import { runVoting, VotingMethod, VotingResult, AgentTrace } from '@/lib/voting';

interface UploadedVotingFile {
  id: string;
  name: string;
  size: number;
  rowCount: number;
  columns: string[];
  dimensions: string[];
  data: any[];
  error?: string;
}

export default function ResearcherVotingPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedVotingFile[]>([]);
  const [votingColumns, setVotingColumns] = useState<string[]>([]);
  const [manualColumnInput, setManualColumnInput] = useState('');
  const [votingMethod, setVotingMethod] = useState<VotingMethod>('SOFT_VOTING');
  const [weightMode, setWeightMode] = useState<'auto' | 'manual'>('auto');
  const [customWeights, setCustomWeights] = useState<Record<string, string>>({});
  
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically detect columns that differ across uploaded files
  useEffect(() => {
    if (uploadedFiles.length < 2) {
      setVotingColumns([]);
      setAnalysisResult(null);
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

    setVotingColumns(differingCols);
    setAnalysisResult(null); // Clear old analysis if file state changes
  }, [uploadedFiles]);

  // Initialize and align weights when uploaded files change
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      const N = uploadedFiles.length;
      const equalVal = 1 / N;
      const newWeights: Record<string, string> = {};
      uploadedFiles.forEach((f) => {
        newWeights[f.id] = equalVal.toFixed(4);
      });

      // Adjust the last one to sum to exactly 1.0
      const ids = uploadedFiles.map((f) => f.id);
      if (ids.length > 1) {
        let sum = 0;
        for (let i = 0; i < ids.length - 1; i++) {
          sum += parseFloat(newWeights[ids[i]]);
        }
        newWeights[ids[ids.length - 1]] = (1.0 - sum).toFixed(4);
      }
      setCustomWeights(newWeights);
    } else {
      setCustomWeights({});
    }
  }, [uploadedFiles]);

  // Get weights validation results
  const getWeightsValidation = () => {
    if (votingMethod !== 'WEIGHTED_VOTING' || weightMode === 'auto') {
      return { isValid: true, error: '' };
    }

    const entries = Object.entries(customWeights);
    if (entries.length !== uploadedFiles.length) {
      return { isValid: false, error: 'Weights are not fully initialized.' };
    }

    const numericWeights: { fileId: string; val: number }[] = [];
    for (const [fileId, weightStr] of entries) {
      const val = parseFloat(weightStr);
      if (isNaN(val)) {
        return { isValid: false, error: 'All weights must be valid numbers.' };
      }
      // Criteria: Weight of each file need in range (0, 1)
      if (val <= 0 || val >= 1) {
        return { isValid: false, error: 'Each weight must be strictly between 0 and 1.' };
      }
      numericWeights.push({ fileId, val });
    }

    const sum = numericWeights.reduce((s, item) => s + item.val, 0);
    const roundedSum = Math.round(sum * 10000) / 10000;
    if (roundedSum !== 1.0) {
      return {
        isValid: false,
        error: `Total weight must sum to exactly 1.0 (Current sum: ${roundedSum})`,
      };
    }

    return { isValid: true, error: '' };
  };

  const weightsValidation = getWeightsValidation();

  // Helper to parse a single CSV file
  const processFile = (file: File): Promise<UploadedVotingFile> => {
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
    const newFiles: UploadedVotingFile[] = [];
    
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
    setVotingColumns([]);
  };

  const handleConsensusAggregation = () => {
    if (uploadedFiles.length < 2 || votingColumns.length === 0 || !weightsValidation.isValid) return;
    setIsAnalyzing(true);
    
    setTimeout(() => {
      try {
        const T = Math.min(...uploadedFiles.map((f) => f.data.length));
        const resultsMap: Record<string, VotingResult> = {};
        
        // Parse customWeights into Record<string, number> mapped by filename if in manual mode
        let manualWeightsMap: Record<string, number> | undefined = undefined;
        if (votingMethod === 'WEIGHTED_VOTING' && weightMode === 'manual') {
          manualWeightsMap = {};
          uploadedFiles.forEach((file) => {
            manualWeightsMap![file.name] = parseFloat(customWeights[file.id] || '0');
          });
        }
        
        // 1. Run consensus aggregation for each selected column
        votingColumns.forEach((col) => {
          const traces: AgentTrace[] = uploadedFiles.map((file) => ({
            agentId: file.name,
            values: file.data.map((row) => {
              const v = parseFloat(row[col]);
              return isNaN(v) ? 0 : v;
            }),
          }));

          // Align trace lengths to the shortest row count
          const alignedTraces = traces.map((t) => ({
            ...t,
            values: t.values.slice(0, T),
          }));

          resultsMap[col] = runVoting(votingMethod, alignedTraces, col, manualWeightsMap);
        });

        // 2. Build consensus CSV rows: Copy columns/data from the first file 
        // and replace values in the voting columns with calculated consensus values.
        const outputHeaders = [...uploadedFiles[0].columns];
        const outputRows = Array.from({ length: T }, (_, t) => {
          const row = { ...uploadedFiles[0].data[t] };
          votingColumns.forEach((col) => {
            const consensusVal = resultsMap[col].consensusTrace[t];
            // Format to 4 decimal places for clean floating point consistency
            row[col] = String(Math.round(consensusVal * 10000) / 10000);
          });
          return row;
        });

        const csvString = Papa.unparse({
          fields: outputHeaders,
          data: outputRows,
        });

        // 3. Trigger standard download
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Clean original filename for output naming
        const baseName = uploadedFiles[0].name.replace(/\.csv$/i, '');
        link.download = `${baseName}_consensus_${votingMethod.toLowerCase()}.csv`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // 4. Compute summaries for display
        const fileSummaries = uploadedFiles.map((file) => {
          const dimensionsStats = file.dimensions.reduce((acc: any, dim: string) => {
            const values = file.data.map((row: any) => parseFloat(row[dim])).filter((v: number) => !isNaN(v));
            acc[dim] = {
              avg: values.length > 0 ? Math.round(values.reduce((s: number, v: number) => s + v, 0) / values.length * 100) / 100 : 0,
              min: values.length > 0 ? Math.min(...values) : 0,
              max: values.length > 0 ? Math.max(...values) : 0,
            };
            return acc;
          }, {});
          return { name: file.name, rowCount: file.rowCount, dimensionsStats };
        });

        setAnalysisResult({
          fileCount: uploadedFiles.length,
          fileSummaries,
          votingResults: resultsMap,
          votingColumns,
          votingMethod,
          frameCount: T,
        });

      } catch (err: any) {
        console.error('[Consensus Error]', err);
        alert(`Consensus calculation failed: ${err.message}`);
      } finally {
        setIsAnalyzing(false);
      }
    }, 500);
  };

  const handleAddManualColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const colName = manualColumnInput.trim();
    if (!colName) return;

    // Check duplicate
    if (votingColumns.includes(colName)) {
      alert(`Column "${colName}" is already selected for voting.`);
      return;
    }

    // Check if column exists in all files
    const existsInAll = uploadedFiles.every((f) => f.columns.includes(colName));
    if (!existsInAll) {
      alert(`Column "${colName}" does not exist in all uploaded CSV files.`);
      return;
    }

    setVotingColumns((prev) => [...prev, colName]);
    setManualColumnInput('');
    setAnalysisResult(null); // Reset summary to force fresh consensus calculation
  };

  const removeVotingColumn = (colName: string) => {
    setVotingColumns((prev) => prev.filter((c) => c !== colName));
    setAnalysisResult(null); // Reset summary
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>🗳️</span>
            Consensus Voting
          </h1>
          {uploadedFiles.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={clearAll}>
              Clear All
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          Upload and aggregate multiple annotator output CSV files using Soft, Reliability-Weighted, or EWE voting models.
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
          <div className={styles.uploadContent}>
            <div className={styles.uploadIcon}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
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
            <h3 className={styles.uploadTitle}>Upload output CSV files</h3>
            <p className={styles.uploadSub}>
              Drag and drop multiple exported CSVs here, or click to browse
            </p>
            <span className={styles.uploadLimit}>Supports both label-only and appended CSV exports</span>
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
            <h2 className={styles.sectionTitle}>
              Uploaded Files ({uploadedFiles.length})
            </h2>
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

            {/* Voting Columns Tags block */}
            <div className={styles.columnsBlock}>
              <span className={styles.blockLabel}>Columns involved in consensus voting</span>
              <div className={styles.chipsRow}>
                {votingColumns.map((col) => (
                  <span key={col} className={styles.columnChip}>
                    {col}
                    <button
                      type="button"
                      className={styles.removeChipBtn}
                      onClick={() => removeVotingColumn(col)}
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
              {votingColumns.length === 0 && (
                <p className={styles.noColumnsWarn}>
                  ⚠️ No columns selected. Upload files or type column names manually to enable aggregation.
                </p>
              )}
            </div>

            {/* Voting Options Block */}
            <div className={styles.votingSelector}>
              <span className={styles.votingSelectorLabel}>Consensus Algorithm Selection</span>
              <div className={styles.votingOptions}>
                {([
                  { value: 'SOFT_VOTING', label: 'Soft Voting', desc: 'Equal weight arithmetic mean across annotators.' },
                  { value: 'WEIGHTED_VOTING', label: 'Weighted Voting', desc: 'Manual weighting for each file.' },
                  { value: 'EWE', label: 'EWE (Evaluator Weighted)', desc: 'Denoising via inverse variance weighting.' },
                ] as { value: VotingMethod; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.votingOption} ${votingMethod === opt.value ? styles.votingOptionActive : ''}`}
                    onClick={() => {
                      setVotingMethod(opt.value);
                      setAnalysisResult(null); // Clear summary when method changes to prevent state desync
                    }}
                  >
                    <span className={styles.votingOptionLabel}>{opt.label}</span>
                    <span className={styles.votingOptionDesc}>{opt.desc}</span>
                    {opt.value === 'SOFT_VOTING' && (
                      <span className={styles.defaultBadge}>Default</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Weights Configuration Block */}
            {votingMethod === 'WEIGHTED_VOTING' && uploadedFiles.length >= 2 && (
              <div className={styles.weightsConfigBlock}>
                <div className={styles.weightsHeaderRow}>
                  <span className={styles.blockLabel}>⚖️ Annotator Weights Mode</span>
                  <div className={styles.weightModeToggle}>
                    <button
                      type="button"
                      className={`${styles.weightModeBtn} ${weightMode === 'auto' ? styles.weightModeBtnActive : ''}`}
                      onClick={() => {
                        setWeightMode('auto');
                        setAnalysisResult(null);
                      }}
                      id="btn-weight-auto"
                    >
                      🤖 Automatic (Reliability)
                    </button>
                    <button
                      type="button"
                      className={`${styles.weightModeBtn} ${weightMode === 'manual' ? styles.weightModeBtnActive : ''}`}
                      onClick={() => {
                        setWeightMode('manual');
                        setAnalysisResult(null);
                      }}
                      id="btn-weight-manual"
                    >
                      ✏️ Manual Weights
                    </button>
                  </div>
                </div>

                {weightMode === 'auto' ? (
                  <p className={styles.weightsConfigDesc}>
                    Each annotator's weight is automatically derived from their Leave-One-Out (LOO) Krippendorff's alpha reliability score across the cohort (default behavior in paper).
                  </p>
                ) : (
                  <>
                    <p className={styles.weightsConfigDesc}>
                      Set a manual weight for each file. Weights must be strictly between 0 and 1, and the total must sum to exactly 1.0.
                    </p>
                    <div className={styles.weightsInputList}>
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className={styles.weightInputRow}>
                          <span className={styles.weightFileName} title={file.name}>
                            {file.name}
                          </span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            max="1"
                            value={customWeights[file.id] || ''}
                            onChange={(e) => {
                              const newVal = e.target.value;
                              setCustomWeights((prev) => ({
                                ...prev,
                                [file.id]: newVal,
                              }));
                              setAnalysisResult(null); // Reset summary
                            }}
                            className={styles.weightInputField}
                          />
                        </div>
                      ))}
                    </div>
                    {weightsValidation.error ? (
                      <p className={styles.weightsValidationError}>⚠️ {weightsValidation.error}</p>
                    ) : (
                      <p className={styles.weightsValidationSuccess}>✓ Weights are valid (sums to 1.0)</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Consensus Button */}
            <div className={styles.actionBlock}>
              <button
                className={`btn btn-primary ${styles.analyzeBtn} ${
                  uploadedFiles.length >= 2 && votingColumns.length > 0 && weightsValidation.isValid ? 'animate-glow' : ''
                }`}
                disabled={uploadedFiles.length < 2 || votingColumns.length === 0 || isAnalyzing || !weightsValidation.isValid}
                onClick={handleConsensusAggregation}
              >
                {isAnalyzing ? (
                  <>
                    <span className={styles.spinner} />
                    Calculating Consensus...
                  </>
                ) : (
                  '🗳️ Consensus'
                )}
              </button>
              {uploadedFiles.length < 2 && (
                <p className={styles.actionHint}>
                  Upload at least 2 CSV files to start consensus comparison.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Analysis Results Display */}
        {analysisResult && (
          <section className={`${styles.resultsSection} animate-slideUp`}>
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultTitle}>Consensus Aggregation Results</h3>
                <span className={styles.successBadge}>Export Successful</span>
              </div>
              
              <div className={styles.resultContent}>
                <p className={styles.resultText}>
                  Consensus traces have been successfully generated using <strong>{analysisResult.votingMethod.replace(/_/g, ' ')}</strong> across <strong>{analysisResult.frameCount}</strong> frames, and the aggregated CSV has been downloaded.
                </p>

                {/* Voting Results Panel */}
                <div className={styles.votingResultsPanel}>
                  <div className={styles.votingResultsHeader}>
                    <span className={styles.votingMethodBadge}>
                      {analysisResult.votingMethod}
                    </span>
                    <span className={styles.votingDimLabel}>
                      Aggregated Columns: <strong>{analysisResult.votingColumns.join(', ')}</strong>
                    </span>
                  </div>

                  {/* Summary Table of dimensions and trace ranges */}
                  <div className={styles.summaryTableContainer}>
                    <table className={styles.summaryTable}>
                      <thead>
                        <tr>
                          <th>Aggregation Column</th>
                          <th>Mean Consensus</th>
                          <th>Consensus Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.votingColumns.map((col: string) => {
                          const res = analysisResult.votingResults[col];
                          const values = res?.consensusTrace || [];
                          const avg = values.length > 0 ? values.reduce((s: number, v: number) => s + v, 0) / values.length : 0;
                          const min = values.length > 0 ? Math.min(...values) : 0;
                          const max = values.length > 0 ? Math.max(...values) : 0;
                          return (
                            <tr key={col}>
                              <td>
                                <span className={styles.dimBadgeTable}>{col}</span>
                              </td>
                              <td>{avg.toFixed(4)}</td>
                              <td>
                                {min.toFixed(4)} to {max.toFixed(4)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-Agent Weight Breakdown */}
                  <div className={styles.agentWeightsSection}>
                    <h4 className={styles.weightsTitle}>Annotator / Agent Weight Distribution</h4>
                    <table className={styles.summaryTable}>
                      <thead>
                        <tr>
                          <th>Annotator File</th>
                          <th>Resolved Weight</th>
                          {analysisResult.votingMethod === 'WEIGHTED_VOTING' && <th>LOO α Reliability</th>}
                          {analysisResult.votingMethod === 'EWE' && <th>Computed Noise Variance σ²</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {/* We pull metadata from the first voting column's analysis */}
                        {(() => {
                          const firstCol = analysisResult.votingColumns[0];
                          const firstColRes: VotingResult = analysisResult.votingResults[firstCol];
                          if (!firstColRes) return null;

                          return firstColRes.agentMeta.map((agent) => (
                            <tr key={agent.agentId}>
                              <td className={styles.fileNameCell} title={agent.agentId}>
                                {agent.agentId}
                              </td>
                              <td>
                                <div className={styles.weightBarRow}>
                                  <div
                                    className={styles.weightBar}
                                    style={{ width: `${Math.max(4, agent.weight * 100).toFixed(1)}%` }}
                                  />
                                  <span>{(agent.weight * 100).toFixed(1)}%</span>
                                </div>
                              </td>
                              {analysisResult.votingMethod === 'WEIGHTED_VOTING' && (
                                <td>{agent.alphaReliability?.toFixed(4) ?? '—'}</td>
                              )}
                              {analysisResult.votingMethod === 'EWE' && (
                                <td>{agent.empiricalVariance?.toFixed(6) ?? '—'}</td>
                              )}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
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
        <span>Consensus Voting v1.0</span>
      </footer>
    </div>
  );
}
