import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const AUDIO_DIR = path.join(process.cwd(), 'app', 'api', 'jingle', 'audio');
const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedFile = url.searchParams.get('file');

  if (!requestedFile) {
    return NextResponse.json({ error: 'Missing "file" query parameter' }, { status: 400 });
  }

  const safeFileName = path.basename(requestedFile);
  const filePath = path.join(AUDIO_DIR, safeFileName);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(safeFileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to load jingle audio', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}
