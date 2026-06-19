import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import '@/lib/load-env';
import { DOCUMENTS_DIR } from '@agent/paths';
import { sanitizeDocumentFilename } from '@agent/lib/documents';

const TEXT_EXTENSIONS = new Set(['.txt', '.md']);

async function readPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;
    const safeName = sanitizeDocumentFilename(decodeURIComponent(filename));
    const filePath = path.join(DOCUMENTS_DIR, safeName);

    if (!filePath.startsWith(DOCUMENTS_DIR)) {
      return Response.json({ error: 'Invalid path' }, { status: 400 });
    }

    const ext = path.extname(safeName).toLowerCase();
    let content: string;

    if (TEXT_EXTENSIONS.has(ext)) {
      content = await readFile(filePath, 'utf-8');
    } else if (ext === '.pdf') {
      const buffer = await readFile(filePath);
      content = await readPdfText(buffer);
    } else {
      return Response.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const truncated = content.length > 20_000;

    return Response.json({
      filename: safeName,
      content: truncated ? content.slice(0, 20_000) : content,
      truncated,
      characterCount: content.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read document';
    const status = message.includes('ENOENT') ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
