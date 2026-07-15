import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { resolveDocumentName } from './documents.js';
import { DOCUMENTS_DIR } from '../paths.js';

async function readPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

export async function readDocumentTextByName(options: {
  filename?: string;
  hint?: string;
  useLatest?: boolean;
  keywords?: string[];
}): Promise<
  | { filename: string; content: string; resolvedBy: string; alternatives?: string[] }
  | { error: string; matches?: string[] }
> {
  const resolved = await resolveDocumentName(options);

  if ('error' in resolved) {
    return resolved;
  }

  const filePath = path.join(DOCUMENTS_DIR, resolved.filename);
  const ext = path.extname(filePath).toLowerCase();

  let content: string;
  if (ext === '.pdf') {
    content = await readPdfText(await readFile(filePath));
  } else if (ext === '.txt' || ext === '.md') {
    content = await readFile(filePath, 'utf-8');
  } else {
    return { error: `Unsupported file type: ${ext}` };
  }

  return {
    filename: resolved.filename,
    content,
    resolvedBy: resolved.resolvedBy,
    alternatives: 'alternatives' in resolved ? resolved.alternatives : undefined,
  };
}
