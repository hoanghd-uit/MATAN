/**
 * Converts an AudioBuffer into a WAV Blob (16-bit PCM)
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const numSamples = buffer.length;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numOfChan * bytesPerSample;
  const byteRate = buffer.sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  let offset = 0;

  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
    offset += str.length;
  }

  // RIFF chunk descriptor
  writeString('RIFF');
  view.setUint32(offset, totalSize - 8, true);
  offset += 4;
  writeString('WAVE');

  // fmt sub-chunk
  writeString('fmt ');
  view.setUint32(offset, 16, true); // Subchunk1Size (16 for PCM)
  offset += 4;
  view.setUint16(offset, format, true); // AudioFormat (1 for PCM)
  offset += 2;
  view.setUint16(offset, numOfChan, true); // NumChannels
  offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); // SampleRate
  offset += 4;
  view.setUint32(offset, byteRate, true); // ByteRate
  offset += 4;
  view.setUint16(offset, blockAlign, true); // BlockAlign
  offset += 2;
  view.setUint16(offset, bitDepth, true); // BitsPerSample
  offset += 2;

  // data sub-chunk
  writeString('data');
  view.setUint32(offset, dataSize, true); // Subchunk2Size
  offset += 4;

  // Write interleaved PCM samples
  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      let sample = channels[channel][i];
      // Clamp sample to [-1, 1]
      sample = Math.max(-1, Math.min(1, sample));
      // Scale to 16-bit signed integer
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Concatenates multiple audio files into a single unified WAV File
 */
export async function concatenateAudioFiles(
  files: File[],
  onProgress?: (status: string) => void
): Promise<File> {
  if (files.length === 0) {
    throw new Error('No audio files to concatenate.');
  }
  if (files.length === 1) {
    return files[0];
  }

  const AudioContextClass =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : null;

  if (!AudioContextClass) {
    return files[0];
  }

  const audioCtx = new AudioContextClass();
  try {
    const decodedBuffers: AudioBuffer[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(`Decoding audio (${i + 1}/${files.length}): ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        audioCtx.decodeAudioData(
          arrayBuffer,
          (buf) => resolve(buf),
          (err) => reject(new Error(`Failed to decode audio file "${file.name}": ${err instanceof Error ? err.message : String(err)}`))
        );
      });
      decodedBuffers.push(decoded);
    }

    onProgress?.('Combining audio tracks...');

    const sampleRate = decodedBuffers[0].sampleRate;
    const numberOfChannels = Math.max(...decodedBuffers.map((b) => b.numberOfChannels));
    const totalDuration = decodedBuffers.reduce((sum, b) => sum + b.duration, 0);
    const totalLength = Math.max(1, Math.ceil(totalDuration * sampleRate));

    const OfflineAudioContextClass =
      typeof window !== 'undefined'
        ? window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
        : null;

    if (!OfflineAudioContextClass) {
      throw new Error('OfflineAudioContext is not supported in this environment.');
    }

    const offlineCtx = new OfflineAudioContextClass(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    let currentTime = 0;
    for (const buf of decodedBuffers) {
      const source = offlineCtx.createBufferSource();
      source.buffer = buf;
      source.connect(offlineCtx.destination);
      source.start(currentTime);
      currentTime += buf.duration;
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWavBlob(renderedBuffer);

    const baseName = files.map((f) => f.name.replace(/\.[^/.]+$/, '')).join('+');
    const combinedFileName = `${baseName}.wav`;

    return new File([wavBlob], combinedFileName, { type: 'audio/wav' });
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}
