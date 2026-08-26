import Papa from 'papaparse';
import type { TelemetryRow } from '@/types';

/**
 * Export the original CSV data with appended columns for each dimension or export labels only.
 * Generates and triggers download of the labeled CSV file.
 */
export function exportLabeledCSV(
  headers: string[],
  data: TelemetryRow[],
  ratings: Record<string, number[]>,
  originalFileName: string,
  mode: 'append' | 'label_only' = 'append',
  customFileName?: string,
  dimensions: { name: string }[] = [],
): void {
  let csv = '';

  const dimensionNames = dimensions.map((d) => d.name);

  if (mode === 'label_only') {
    // Find a timestamp header in the source file or fallback to [control]timestamp_unix
    const timestampColumn = headers.find((h) => h.toLowerCase().includes('timestamp')) || '[control]timestamp_unix';
    const exportHeaders = [timestampColumn, ...dimensionNames];

    const exportData = data.map((row, i) => {
      const exportRow: Record<string, string> = {
        [timestampColumn]: row[timestampColumn] || String(i),
      };
      dimensionNames.forEach((name) => {
        exportRow[name] = String(ratings[name]?.[i] ?? 0);
      });
      return exportRow;
    });

    csv = Papa.unparse({
      fields: exportHeaders,
      data: exportData,
    });
  } else {
    // Append to CSV source
    const augmentedHeaders = [...headers, ...dimensionNames];
    const augmentedData = data.map((row, i) => {
      const exportRow = { ...row };
      dimensionNames.forEach((name) => {
        exportRow[name] = String(ratings[name]?.[i] ?? 0);
      });
      return exportRow;
    });

    csv = Papa.unparse({
      fields: augmentedHeaders,
      data: augmentedData,
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  // Use customized filename if provided, otherwise default to the legacy format
  const downloadName = customFileName || `${originalFileName.replace(/\.csv$/i, '')}_labeled.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
