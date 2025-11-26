import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'app', 'public', 'audio', 'jingle main.mp3');
    const data = await fs.readFile(filePath);

    return new NextResponse(data, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to load jingle audio', error);
    return new NextResponse('Not found', { status: 404 });
  }
}
