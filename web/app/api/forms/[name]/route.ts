import { readFile } from 'node:fs/promises';
import path from 'node:path';
import '@/lib/load-env';
import { FORMS_DIR } from '@agent/paths';

/** Serve a JSON form template definition (fields, labels, required flags). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const safeName = path.basename(decodeURIComponent(name)).replace(/\.json$/, '');
    const filePath = path.resolve(FORMS_DIR, `${safeName}.json`);

    if (!filePath.startsWith(FORMS_DIR)) {
      return Response.json({ error: 'Invalid path' }, { status: 400 });
    }

    const raw = await readFile(filePath, 'utf-8');
    return Response.json(JSON.parse(raw));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load form';
    const status = message.includes('ENOENT') ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
