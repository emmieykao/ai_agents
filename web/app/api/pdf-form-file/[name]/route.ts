import { readFile } from 'node:fs/promises';
import '@/lib/load-env';
import { resolvePdfFormLocation } from '@agent/lib/pdf-form-resolve';

/** Serve a blank PDF form template (from forms/pdf/ or an uploaded fillable PDF). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const resolved = await resolvePdfFormLocation(decodeURIComponent(name));

    if ('error' in resolved) {
      return Response.json(resolved, { status: 404 });
    }

    const bytes = await readFile(resolved.filePath);

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${resolved.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load PDF form';
    return Response.json({ error: message }, { status: 500 });
  }
}
