import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';
import { tool } from 'ai';
import { z } from 'zod';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOCUMENTS_DIR = path.resolve(__dirname, '../../documents');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);

function resolveDocumentPath(filename: string): string {
  const safeName = path.basename(filename);
  const resolved = path.resolve(DOCUMENTS_DIR, safeName);

  if (!resolved.startsWith(DOCUMENTS_DIR)) {
    throw new Error('Invalid document path');
  }

  return resolved;
}

async function readPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

async function readDocumentContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const buffer = await readFile(filePath);
    return readPdfText(buffer);
  }

  if (ext === '.txt' || ext === '.md') {
    return readFile(filePath, 'utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export const listDocuments = tool({
  description:
    'List all readable documents in the documents folder (.txt, .md, .pdf)',
  inputSchema: z.object({}),
  execute: async () => {
    const entries = await readdir(DOCUMENTS_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .filter((e) => SUPPORTED_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map(async (e) => {
          const filePath = path.join(DOCUMENTS_DIR, e.name);
          const info = await stat(filePath);
          return {
            name: e.name,
            sizeBytes: info.size,
            modified: info.mtime.toISOString(),
          };
        }),
    );

    return { documents: files, count: files.length };
  },
});

export const readDocument = tool({
  description:
    'Read the full text content of a document by filename (e.g. "report.pdf")',
  inputSchema: z.object({
    filename: z
      .string()
      .describe('The document filename, e.g. "sample.txt" or "report.pdf"'),
  }),
  execute: async ({ filename }) => {
    const filePath = resolveDocumentPath(filename);
    const ext = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return {
        error: `Unsupported file type. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
      };
    }

    try {
      const content = await readDocumentContent(filePath);
      const truncated = content.length > 12_000;
      return {
        filename,
        content: truncated ? content.slice(0, 12_000) : content,
        truncated,
        characterCount: content.length,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to read document',
      };
    }
  },
});

export const searchDocuments = tool({
  description:
    'Search for a phrase across all documents and return matching excerpts',
  inputSchema: z.object({
    query: z.string().describe('Text or phrase to search for (case-insensitive)'),
  }),
  execute: async ({ query }) => {
    const entries = await readdir(DOCUMENTS_DIR, { withFileTypes: true });
    const needle = query.toLowerCase();
    const matches: Array<{ filename: string; excerpt: string }> = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const filePath = path.join(DOCUMENTS_DIR, entry.name);
      let content: string;

      try {
        content = await readDocumentContent(filePath);
      } catch {
        continue;
      }

      const index = content.toLowerCase().indexOf(needle);
      if (index === -1) continue;

      const start = Math.max(0, index - 80);
      const end = Math.min(content.length, index + query.length + 80);
      matches.push({
        filename: entry.name,
        excerpt: content.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }

    return { query, matchCount: matches.length, matches };
  },
});

export const documentTools = {
  listDocuments,
  readDocument,
  searchDocuments,
};
