import JSZip from 'jszip';
import type { TelemetryRow } from '@/types';
import { parseCSV, parseGuidedLabelCSV } from '@/lib/csv-parser';
import { concatenateAudioFiles } from '@/lib/audio-utils';

export interface QuickLoadResult {
  success: boolean;
  gameplayFiles: File[];
  telemetryHeaders: string[];
  telemetryData: TelemetryRow[];
  telemetryFileName: string;
  audioFile: File | null;
  gamingSpaceFile: File | null;
  guidedLabelFile?: File | null;
  guidedLabelHeaders?: string[];
  guidedLabelRawData?: Record<string, string>[];
  guidedLabelFileName?: string;
  dataSampleId: string;
  errors: string[];
  warnings: string[];
}

export type ProgressCallback = (status: string, current?: number, total?: number) => void;

interface FileEntry {
  path: string;
  name: string;
  getFile: () => Promise<File>;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const CSV_EXTS = new Set(['.csv']);

function getExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function getMimeType(filename: string): string {
  const ext = getExt(filename);
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.csv':
      return 'text/csv';
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

function isSystemOrHiddenPath(path: string): boolean {
  if (path.includes('__MACOSX/') || path.includes('/__MACOSX/')) return true;
  const segments = path.split('/');
  return segments.some((s) => s.startsWith('.') || s.startsWith('._'));
}

/**
 * Normalizes entries and categorizes them into dataset components
 */
async function processEntries(
  entries: FileEntry[],
  fallbackSampleId: string,
  onProgress?: ProgressCallback
): Promise<QuickLoadResult> {
  const validEntries = entries.filter((e) => !isSystemOrHiddenPath(e.path));

  // Determine root directory prefix if any (e.g. "20260815_094759/")
  // Look for occurrences of ScreenRecording, Telemetry, or VoiceChat
  let rootPrefix = '';
  let detectedSampleId = fallbackSampleId;

  for (const entry of validEntries) {
    const parts = entry.path.split('/');
    const folderIdx = parts.findIndex(
      (p) => p === 'ScreenRecording' || p === 'Telemetry' || p === 'VoiceChat'
    );
    if (folderIdx > 0) {
      rootPrefix = parts.slice(0, folderIdx).join('/') + '/';
      detectedSampleId = parts[folderIdx - 1];
      break;
    }
  }

  onProgress?.('Scanning files and directories...');

  const screenRecordingEntries: FileEntry[] = [];
  const telemetryEntries: FileEntry[] = [];
  const voiceChatEntries: FileEntry[] = [];
  const rootVideoEntries: FileEntry[] = [];
  const rootGuidedEntries: FileEntry[] = [];

  for (const entry of validEntries) {
    const relativePath = rootPrefix && entry.path.startsWith(rootPrefix)
      ? entry.path.slice(rootPrefix.length)
      : entry.path;

    const parts = relativePath.split('/');
    const ext = getExt(entry.name);

    if (parts[0] === 'ScreenRecording') {
      // Must be an image inside ScreenRecording (either direct or in subfolder)
      if (parts.length >= 2 && IMAGE_EXTS.has(ext)) {
        screenRecordingEntries.push(entry);
      }
    } else if (parts[0] === 'Telemetry') {
      if (CSV_EXTS.has(ext)) {
        telemetryEntries.push(entry);
      }
    } else if (parts[0] === 'VoiceChat') {
      if (AUDIO_EXTS.has(ext)) {
        voiceChatEntries.push(entry);
      }
    } else if (parts.length === 1 && VIDEO_EXTS.has(ext)) {
      // In same place with ScreenRecording/, Telemetry/, VoiceChat/
      rootVideoEntries.push(entry);
    } else if (parts.length === 1 && CSV_EXTS.has(ext)) {
      rootGuidedEntries.push(entry);
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Process Gameplay Media (Images in ScreenRecording)
  let gameplayFiles: File[] = [];
  if (screenRecordingEntries.length === 0) {
    errors.push('No image frames found in ScreenRecording folder.');
  } else {
    // Sort entries naturally by path, then by name
    screenRecordingEntries.sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    onProgress?.(`Extracting gameplay frames (0/${screenRecordingEntries.length})...`, 0, screenRecordingEntries.length);
    const total = screenRecordingEntries.length;
    const files: File[] = [];
    for (let i = 0; i < total; i++) {
      const f = await screenRecordingEntries[i].getFile();
      files.push(f);
      if (i % 50 === 0 || i === total - 1) {
        onProgress?.(`Extracting gameplay frames (${i + 1}/${total})...`, i + 1, total);
      }
    }
    gameplayFiles = files;
  }

  // 2. Process Telemetry Log (.csv in Telemetry folder)
  let telemetryHeaders: string[] = [];
  let telemetryData: TelemetryRow[] = [];
  let telemetryFileName = '';

  if (telemetryEntries.length === 0) {
    errors.push('No CSV telemetry file found in Telemetry folder.');
  } else {
    // Sort telemetry entries by filename naturally
    telemetryEntries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.path.localeCompare(b.path, undefined, { numeric: true })
    );

    onProgress?.(`Parsing telemetry CSVs (0/${telemetryEntries.length})...`, 0, telemetryEntries.length);
    const parsedFileNames: string[] = [];
    const combinedData: TelemetryRow[] = [];
    const combinedHeaders: string[] = [];

    for (let i = 0; i < telemetryEntries.length; i++) {
      const csvEntry = telemetryEntries[i];
      const csvFile = await csvEntry.getFile();
      parsedFileNames.push(csvFile.name);
      onProgress?.(
        `Parsing telemetry CSV (${i + 1}/${telemetryEntries.length}): ${csvFile.name}...`,
        i + 1,
        telemetryEntries.length
      );

      const parseResult = await parseCSV(csvFile);
      if (parseResult.error) {
        errors.push(`Telemetry CSV (${csvFile.name}) error: ${parseResult.error}`);
      } else {
        if (combinedHeaders.length === 0) {
          combinedHeaders.push(...parseResult.headers);
        } else {
          for (const h of parseResult.headers) {
            if (!combinedHeaders.includes(h)) {
              combinedHeaders.push(h);
            }
          }
        }
        combinedData.push(...parseResult.data);
      }
    }

    telemetryHeaders = combinedHeaders;
    telemetryData = combinedData;
    telemetryFileName = parsedFileNames.length === 1
      ? parsedFileNames[0]
      : parsedFileNames.join(', ');
  }

  // 3. Process VoiceChat Audio
  let audioFile: File | null = null;
  if (voiceChatEntries.length === 0) {
    errors.push('No audio file found in VoiceChat folder.');
  } else {
    // Sort voiceChat entries by filename naturally
    voiceChatEntries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.path.localeCompare(b.path, undefined, { numeric: true })
    );

    if (voiceChatEntries.length === 1) {
      onProgress?.('Loading VoiceChat audio...');
      audioFile = await voiceChatEntries[0].getFile();
    } else {
      onProgress?.(`Loading ${voiceChatEntries.length} VoiceChat audio files...`, 0, voiceChatEntries.length);
      const audioFiles: File[] = [];
      for (let i = 0; i < voiceChatEntries.length; i++) {
        const f = await voiceChatEntries[i].getFile();
        audioFiles.push(f);
        onProgress?.(
          `Reading VoiceChat audio (${i + 1}/${voiceChatEntries.length}): ${f.name}...`,
          i + 1,
          voiceChatEntries.length
        );
      }

      try {
        audioFile = await concatenateAudioFiles(audioFiles, (status) => onProgress?.(status));
      } catch (err: unknown) {
        errors.push(`VoiceChat audio concatenation error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 4. Process Gaming Space Video (Optional)
  let gamingSpaceFile: File | null = null;
  if (rootVideoEntries.length > 0) {
    onProgress?.('Loading Gaming Space face cam video...');
    gamingSpaceFile = await rootVideoEntries[0].getFile();
  } else {
    warnings.push('No root video found for Gaming Space (face cam). This is optional.');
  }

  // 5. Process Guided Label CSV (Optional)
  let guidedLabelFile: File | null = null;
  let guidedLabelHeaders: string[] = [];
  let guidedLabelRawData: Record<string, string>[] = [];
  let guidedLabelFileName = '';
  if (rootGuidedEntries.length > 0) {
    onProgress?.('Parsing guided label CSV...');
    const guidedEntry = rootGuidedEntries[0];
    const gFile = await guidedEntry.getFile();
    const gResult = await parseGuidedLabelCSV(gFile);
    if (!gResult.error) {
      guidedLabelFile = gFile;
      guidedLabelHeaders = gResult.headers;
      guidedLabelRawData = gResult.rawData;
      guidedLabelFileName = gFile.name;
    }
  }

  const success = errors.length === 0;

  return {
    success,
    gameplayFiles,
    telemetryHeaders,
    telemetryData,
    telemetryFileName,
    audioFile,
    gamingSpaceFile,
    guidedLabelFile,
    guidedLabelHeaders,
    guidedLabelRawData,
    guidedLabelFileName,
    dataSampleId: detectedSampleId,
    errors,
    warnings,
  };
}

async function scanFileSystemEntry(entry: any, path = ''): Promise<FileEntry[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file: File) => {
        resolve([
          {
            path: path ? `${path}/${file.name}` : file.name,
            name: file.name,
            getFile: async () => file,
          },
        ]);
      });
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const readAllEntries = async (): Promise<any[]> => {
      const all: any[] = [];
      const readBatch = async (): Promise<void> => {
        const batch: any[] = await new Promise((res) => dirReader.readEntries(res));
        if (batch.length > 0) {
          all.push(...batch);
          await readBatch();
        }
      };
      await readBatch();
      return all;
    };

    const children = await readAllEntries();
    const currentPath = path ? `${path}/${entry.name}` : entry.name;
    const nested = await Promise.all(
      children.map((child) => scanFileSystemEntry(child, currentPath))
    );
    return nested.flat();
  }
  return [];
}

/**
 * Process folder upload from FileList or File[] (via input webkitdirectory or drop)
 */
export async function processFolderUpload(
  files: FileList | File[],
  onProgress?: ProgressCallback
): Promise<QuickLoadResult> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    return {
      success: false,
      gameplayFiles: [],
      telemetryHeaders: [],
      telemetryData: [],
      telemetryFileName: '',
      audioFile: null,
      gamingSpaceFile: null,
      dataSampleId: '',
      errors: ['No files selected in folder.'],
      warnings: [],
    };
  }

  let folderName = 'Dataset';
  const firstPath = fileArray[0].webkitRelativePath || fileArray[0].name;
  if (firstPath.includes('/')) {
    folderName = firstPath.split('/')[0];
  }

  const entries: FileEntry[] = fileArray.map((file) => {
    const relPath = file.webkitRelativePath || file.name;
    return {
      path: relPath,
      name: file.name,
      getFile: async () => file,
    };
  });

  return processEntries(entries, folderName, onProgress);
}

/**
 * Process .zip file upload using JSZip
 */
export async function processZipUpload(
  zipFile: File,
  onProgress?: ProgressCallback
): Promise<QuickLoadResult> {
  onProgress?.('Reading and unpacking .zip archive...');
  const jszip = new JSZip();

  let zip: JSZip;
  try {
    const buffer = await zipFile.arrayBuffer();
    zip = await jszip.loadAsync(buffer);
  } catch (err: any) {
    return {
      success: false,
      gameplayFiles: [],
      telemetryHeaders: [],
      telemetryData: [],
      telemetryFileName: '',
      audioFile: null,
      gamingSpaceFile: null,
      dataSampleId: zipFile.name.replace(/\.zip$/i, ''),
      errors: [`Failed to unzip file: ${err?.message || 'Invalid ZIP archive'}`],
      warnings: [],
    };
  }

  const entries: FileEntry[] = [];
  const baseZipName = zipFile.name.replace(/\.zip$/i, '');

  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      const fileName = relativePath.split('/').pop() || relativePath;
      entries.push({
        path: relativePath,
        name: fileName,
        getFile: async () => {
          const blob = await zipEntry.async('blob');
          return new File([blob], fileName, { type: getMimeType(fileName) });
        },
      });
    }
  });

  return processEntries(entries, baseZipName, onProgress);
}

/**
 * Handles Drag & Drop data transfer items (supports both dropped folder and dropped .zip)
 */
export async function processDataTransfer(
  dataTransfer: DataTransfer,
  onProgress?: ProgressCallback
): Promise<QuickLoadResult> {
  const files = Array.from(dataTransfer.files || []);
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
    return processZipUpload(files[0], onProgress);
  }

  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
    onProgress?.('Scanning dropped folder hierarchy...');
    const allEntries: FileEntry[] = [];
    for (const item of items) {
      const entry = (item as any).webkitGetAsEntry();
      if (entry) {
        const scanned = await scanFileSystemEntry(entry);
        allEntries.push(...scanned);
      }
    }
    if (allEntries.length > 0) {
      let sampleId = 'Dataset';
      if (allEntries[0].path.includes('/')) {
        sampleId = allEntries[0].path.split('/')[0];
      }
      return processEntries(allEntries, sampleId, onProgress);
    }
  }

  return processFolderUpload(dataTransfer.files, onProgress);
}
