import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  const baseDir = path.join(process.cwd(), 'sample_data');

  try {
    if (type === 'list-images') {
      const imagesDir = path.join(baseDir, 'ScreenRecording', 'screen_20260804_140754__00002698');
      if (!fs.existsSync(imagesDir)) {
        return new Response(`Directory not found: ${imagesDir}`, { status: 404 });
      }
      const files = fs.readdirSync(imagesDir)
        .filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return NextResponse.json({ files });
    }

    if (type === 'image') {
      const name = searchParams.get('name');
      if (!name) return new Response('Missing name', { status: 400 });
      // Security: basic check to prevent path traversal
      if (name.includes('/') || name.includes('..')) {
        return new Response('Invalid name', { status: 400 });
      }
      const imgPath = path.join(baseDir, 'ScreenRecording', 'screen_20260804_140754__00002698', name);
      if (!fs.existsSync(imgPath)) {
        return new Response(`File not found: ${imgPath}`, { status: 404 });
      }
      const fileBuffer = fs.readFileSync(imgPath);
      return new Response(fileBuffer, {
        headers: { 'Content-Type': 'image/jpeg' }
      });
    }

    if (type === 'telemetry') {
      const telemetryPath = path.join(baseDir, 'Telemetry', 'telemetry_20260804_140435.csv');
      if (!fs.existsSync(telemetryPath)) {
        return new Response(`File not found: ${telemetryPath}`, { status: 404 });
      }
      const csvContent = fs.readFileSync(telemetryPath, 'utf8');
      return new Response(csvContent, {
        headers: { 'Content-Type': 'text/csv' }
      });
    }

    if (type === 'audio') {
      const audioPath = path.join(baseDir, 'VoiceChat', 'voice_20260804_140754_000.wav');
      if (!fs.existsSync(audioPath)) {
        return new Response(`File not found: ${audioPath}`, { status: 404 });
      }
      const fileBuffer = fs.readFileSync(audioPath);
      return new Response(fileBuffer, {
        headers: { 'Content-Type': 'audio/wav' }
      });
    }

    return new Response('Invalid type', { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return new Response(message, { status: 500 });
  }
}
