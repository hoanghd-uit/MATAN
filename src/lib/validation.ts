const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const CSV_EXTENSIONS = ['.csv'];

function getExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

export function isValidVideo(file: File): boolean {
  return VIDEO_EXTENSIONS.includes(getExtension(file.name));
}

export function isValidImage(file: File): boolean {
  return IMAGE_EXTENSIONS.includes(getExtension(file.name));
}

export function isValidAudio(file: File): boolean {
  return AUDIO_EXTENSIONS.includes(getExtension(file.name));
}

export function isValidCSV(file: File): boolean {
  return CSV_EXTENSIONS.includes(getExtension(file.name));
}

export function validateAllUploads(
  hasGameplay: boolean,
  hasTelemetry: boolean,
  hasAudio: boolean,
): boolean {
  return hasGameplay && hasTelemetry && hasAudio;
}
