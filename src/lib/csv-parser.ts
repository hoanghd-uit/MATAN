import Papa from 'papaparse';
import type { TelemetryRow } from '@/types';

const REQUIRED_COLUMN = '[control]timestamp_unix';

interface ParseResult {
  headers: string[];
  data: TelemetryRow[];
  error?: string;
}

export async function parseCSV(file: File | string): Promise<ParseResult> {
  const content = typeof file === 'string' ? file : await file.text();
  return new Promise((resolve) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        if (!headers.includes(REQUIRED_COLUMN)) {
          resolve({
            headers: [],
            data: [],
            error: `Missing required column: ${REQUIRED_COLUMN}`,
          });
          return;
        }
        resolve({
          headers,
          data: results.data as TelemetryRow[],
        });
      },
      error: (err: Error) => {
        resolve({ headers: [], data: [], error: err.message });
      },
    });
  });
}

export interface GuidedLabelParseResult {
  headers: string[];
  rawData: Record<string, string>[];
  timestampColumn?: string;
  error?: string;
}

export async function parseGuidedLabelCSV(file: File | string): Promise<GuidedLabelParseResult> {
  const content = typeof file === 'string' ? file : await file.text();
  return new Promise((resolve) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        if (headers.length === 0) {
          resolve({
            headers: [],
            rawData: [],
            error: 'CSV file contains no headers or is empty.',
          });
          return;
        }

        const timestampColumn =
          headers.find((h) => h.toLowerCase().includes('timestamp')) ||
          (headers.includes(REQUIRED_COLUMN) ? REQUIRED_COLUMN : undefined);

        if (!timestampColumn) {
          resolve({
            headers,
            rawData: [],
            error: `Missing timestamp column in guided label CSV (e.g. ${REQUIRED_COLUMN}).`,
          });
          return;
        }

        resolve({
          headers,
          rawData: results.data as Record<string, string>[],
          timestampColumn,
        });
      },
      error: (err: Error) => {
        resolve({ headers: [], rawData: [], error: err.message });
      },
    });
  });
}

export function validateGuidedLabelColumns(
  headers: string[],
  dimensions: { name: string }[]
): { valid: boolean; missingDimensions: string[] } {
  if (!headers || headers.length === 0) {
    return { valid: false, missingDimensions: dimensions.map((d) => d.name) };
  }

  const missingDimensions = dimensions
    .map((d) => d.name)
    .filter((name) => !headers.includes(name));

  return {
    valid: missingDimensions.length === 0,
    missingDimensions,
  };
}

