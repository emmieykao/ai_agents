import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCUMENTS_DIR } from '../paths.js';

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type DocumentEntry = {
  name: string;
  sizeBytes: number;
  modified: string;
};

export function sanitizeDocumentFilename(filename: string): string {
  const safeName = path.basename(filename);
  const ext = path.extname(safeName).toLowerCase();

  if (!SUPPORTED_DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type. Allowed: ${[...SUPPORTED_DOCUMENT_EXTENSIONS].join(', ')}`,
    );
  }

  if (!safeName || safeName.startsWith('.')) {
    throw new Error('Invalid filename');
  }

  return safeName;
}

export async function listDocumentFiles(): Promise<DocumentEntry[]> {
  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const entries = await readdir(DOCUMENTS_DIR, { withFileTypes: true });

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) =>
        SUPPORTED_DOCUMENT_EXTENSIONS.has(
          path.extname(entry.name).toLowerCase(),
        ),
      )
      .map(async (entry) => {
        const filePath = path.join(DOCUMENTS_DIR, entry.name);
        const info = await stat(filePath);
        return {
          name: entry.name,
          sizeBytes: info.size,
          modified: info.mtime.toISOString(),
        };
      }),
  );

  return files.sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * Normalize a filename or query for matching: drop the extension and collapse
 * any run of non-alphanumeric characters (spaces, hyphens, underscores) to a
 * single space. This lets "resume 2", "resume-2", and "resume_2" all match
 * "sample-resume-2.txt".
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(txt|md|pdf)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchTokens(value: string): string[] {
  return normalizeForMatch(value).split(' ').filter(Boolean);
}

/**
 * Filler words that show up in natural references ("use my resume", "the second
 * file") but never in filenames. Dropping them lets token matching work on the
 * meaningful words while still succeeding when the query is mostly filler.
 */
const STOP_WORDS = new Set([
  'my', 'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'i',
  'please', 'use', 'using', 'fill', 'out', 'from', 'with', 'and', 'to', 'of',
  'for', 'file', 'files', 'document', 'documents', 'doc', 'docs', 'form',
  'one', 'uploaded', 'upload', 'attached', 'first', 'second', 'third',
  'latest', 'recent', 'newest', 'most', 'last',
]);

/** Query tokens with filler removed; falls back to all tokens if nothing is left. */
function contentTokens(query: string): string[] {
  const all = matchTokens(query);
  const meaningful = all.filter((token) => !STOP_WORDS.has(token));
  return meaningful.length > 0 ? meaningful : all;
}

export function matchDocumentFiles(
  files: DocumentEntry[],
  query: string,
): DocumentEntry[] {
  const needle = normalizeForMatch(query);
  if (!needle) return [];

  const queryTokens = contentTokens(query);

  return files
    .filter((file) => {
      const name = normalizeForMatch(file.name);
      if (name === needle) return true;
      if (name.includes(needle) || needle.includes(name)) return true;

      // Token-subset match: every meaningful word in the query appears in the
      // filename (so "resume 2" matches "sample resume 2" but not "sample resume").
      const fileTokens = matchTokens(file.name);
      return queryTokens.every((token) =>
        fileTokens.some((fileToken) => fileToken === token || fileToken.includes(token)),
      );
    })
    .sort((a, b) => scoreDocumentMatch(b, query) - scoreDocumentMatch(a, query));
}

function scoreDocumentMatch(file: DocumentEntry, query: string): number {
  const name = normalizeForMatch(file.name);
  const needle = normalizeForMatch(query);
  const fileTokens = matchTokens(file.name);
  const queryTokens = contentTokens(query);

  let score = Date.parse(file.modified) / 1_000_000_000_000;

  if (name === needle) score += 100;
  if (name.startsWith(needle) || needle.startsWith(name)) score += 50;

  // Reward each query word matched exactly — this is what disambiguates
  // "resume 2" (matches the "2" token) from a plain "resume".
  const matchedTokens = queryTokens.filter((token) =>
    fileTokens.includes(token),
  ).length;
  score += matchedTokens * 30;

  if (name.includes('resume') || name.includes('cv')) score += 25;
  if (name.includes('lecture') || name.includes('notes')) score -= 10;

  return score;
}

function scoreByKeywords(
  file: DocumentEntry,
  keywords: string[],
  hint?: string,
): number {
  const name = file.name.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (name.includes(keyword.toLowerCase())) {
      score += 1_000;
    }
  }

  if (hint && name.includes(hint)) {
    score += 500;
  }

  if (name.includes('resume') || name.includes('cv')) {
    score += 100;
  }

  if (name.includes('lecture') || name.includes('notes')) {
    score -= 50;
  }

  score += Date.parse(file.modified) / 1_000_000_000_000;

  return score;
}

export function pickPreferredDocument(
  files: DocumentEntry[],
  options?: { hint?: string; keywords?: string[] },
): DocumentEntry | null {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  const keywords = options?.keywords ?? [];
  const hint = options?.hint?.toLowerCase().trim();

  const scored = [...files].sort((a, b) => {
    const score = (file: DocumentEntry) =>
      scoreByKeywords(file, keywords, hint);

    return score(b) - score(a);
  });

  return scored[0] ?? null;
}

export async function resolveDocumentName(options: {
  filename?: string;
  hint?: string;
  useLatest?: boolean;
  keywords?: string[];
}): Promise<
  | { filename: string; resolvedBy: string; alternatives?: string[] }
  | { error: string; matches?: string[] }
> {
  const files = await listDocumentFiles();

  if (files.length === 0) {
    return { error: 'No documents found. Upload a file first.' };
  }

  const tryResolve = (query: string) => {
    const exact = files.find((file) => file.name === path.basename(query));
    if (exact) {
      return { filename: exact.name, resolvedBy: 'exact filename' };
    }

    const matches = matchDocumentFiles(files, query);
    if (matches.length === 1) {
      return {
        filename: matches[0].name,
        resolvedBy: `matched "${query}"`,
      };
    }

    if (matches.length > 1) {
      const best = pickPreferredDocument(matches, { hint: query }) ?? matches[0];
      return {
        filename: best.name,
        resolvedBy: `best of ${matches.length} matches for "${query}"`,
        alternatives: matches
          .filter((file) => file.name !== best.name)
          .map((file) => file.name),
      };
    }

    return null;
  };

  if (options.filename) {
    const resolved = tryResolve(options.filename);
    if (resolved) {
      if ('error' in resolved) return resolved;
      return resolved;
    }
  }

  if (options.hint) {
    const resolved = tryResolve(options.hint);
    if (resolved) {
      if ('error' in resolved) return resolved;
      return resolved;
    }
    return { error: `No document matches "${options.hint}".` };
  }

  if (options.useLatest || files.length === 1) {
    const preferred = pickPreferredDocument(files, {
      hint: options.hint,
      keywords: options.keywords,
    });
    const chosen = preferred ?? files[0];

    return {
      filename: chosen.name,
      resolvedBy: options.useLatest
        ? 'most relevant recent document'
        : 'only document available',
    };
  }

  return {
    error:
      'Multiple documents available. Provide a hint, select one in the UI, or use useLatest.',
    matches: files.map((file) => file.name),
  };
}

export async function saveDocumentFile(
  filename: string,
  data: Buffer,
): Promise<DocumentEntry> {
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    );
  }

  const safeName = sanitizeDocumentFilename(filename);
  const filePath = path.join(DOCUMENTS_DIR, safeName);

  if (!filePath.startsWith(DOCUMENTS_DIR)) {
    throw new Error('Invalid document path');
  }

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  await writeFile(filePath, data);

  const info = await stat(filePath);
  return {
    name: safeName,
    sizeBytes: info.size,
    modified: info.mtime.toISOString(),
  };
}
