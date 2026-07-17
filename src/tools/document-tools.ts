import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { tool } from 'ai';
import { z } from 'zod';
import {
  listDocumentFiles,
  matchDocumentFiles,
  pickPreferredDocument,
  resolveDocumentName,
} from '../lib/documents.js';
import { extractContactHints } from '../lib/contact-extract.js';
import { reportProgress } from '../lib/progress.js';
import { DOCUMENTS_DIR } from '../paths.js';

export { DOCUMENTS_DIR };

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
    const files = await listDocumentFiles();
    return { documents: files, count: files.length };
  },
});

export const findDocument = tool({
  description:
    'Find documents by partial name (e.g. "resume", "lecture", "notes") without needing the exact filename',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Partial filename or keyword, e.g. "resume" or "lecture notes"'),
  }),
  execute: async ({ query }, options) => {
    reportProgress(options?.experimental_context, {
      phase: 'search',
      label: `Looking for a document matching "${query}"`,
    });
    const files = await listDocumentFiles();
    const matches = matchDocumentFiles(files, query);

    reportProgress(options?.experimental_context, {
      phase: 'resolve',
      label: matches[0]
        ? `Best match: ${matches[0].name}`
        : `No document matched "${query}"`,
    });

    return {
      query,
      matches: matches.map((file) => file.name),
      count: matches.length,
      bestMatch: matches[0]?.name ?? null,
    };
  },
});

export const readDocument = tool({
  description:
    'Read document text. Use hint/partial names or useLatest instead of exact filenames when possible.',
  inputSchema: z.object({
    filename: z
      .string()
      .optional()
      .describe('Exact filename if known, e.g. "report.pdf"'),
    hint: z
      .string()
      .optional()
      .describe('Partial name if exact filename is unknown, e.g. "resume"'),
    useLatest: z
      .boolean()
      .optional()
      .describe('Read the most relevant recent document'),
    forContactInfo: z
      .boolean()
      .optional()
      .describe(
        'When filling contact forms, prefer resume/CV documents and return extracted contact hints',
      ),
  }),
  execute: async ({ filename, hint, useLatest, forContactInfo }, options) => {
    const ctx = options?.experimental_context;
    reportProgress(ctx, {
      phase: 'resolve',
      label: `Finding document (${filename ?? hint ?? (useLatest ? 'latest upload' : 'resume')})`,
    });
    const resolved = await resolveDocumentName({
      filename,
      hint: forContactInfo && !filename && !hint ? 'resume' : hint,
      useLatest,
      keywords: forContactInfo ? ['resume', 'cv'] : undefined,
    });

    if ('error' in resolved) {
      return resolved;
    }

    const filePath = resolveDocumentPath(resolved.filename);
    const ext = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return {
        error: `Unsupported file type. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
      };
    }

    try {
      reportProgress(ctx, {
        phase: 'read',
        label: `Reading ${resolved.filename}`,
        detail: resolved.resolvedBy,
      });
      const content = await readDocumentContent(filePath);
      const truncated = content.length > 12_000;
      const contactHints = extractContactHints(content);

      return {
        filename: resolved.filename,
        resolvedBy: resolved.resolvedBy,
        alternatives: 'alternatives' in resolved ? resolved.alternatives : undefined,
        content: truncated ? content.slice(0, 12_000) : content,
        truncated,
        characterCount: content.length,
        contactHints,
        contactInfoFound: contactHints.hasContactInfo,
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
  findDocument,
  readDocument,
  searchDocuments,
};
