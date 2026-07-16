import { readFile } from 'node:fs/promises';
import path from 'node:path';
import '@/lib/load-env';
import { COMPLETED_DIR } from '@agent/paths';

/** Serve a completed form output (PDF or JSON) from the completed/ directory. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;
    // basename() blocks path traversal; only completed outputs are servable.
    const safeName = path.basename(decodeURIComponent(filename));
    const ext = path.extname(safeName).toLowerCase();

    if (ext !== '.pdf' && ext !== '.json') {
      return Response.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const filePath = path.resolve(COMPLETED_DIR, safeName);
    if (!filePath.startsWith(COMPLETED_DIR)) {
      return Response.json({ error: 'Invalid path' }, { status: 400 });
    }

    const bytes = await readFile(filePath);

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': ext === '.pdf' ? 'application/pdf' : 'application/json',
        'Content-Disposition': `inline; filename="${safeName}"`,
        // Completed filenames are timestamped (unique), safe to cache briefly.
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load completed file';
    const status = message.includes('ENOENT') ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
