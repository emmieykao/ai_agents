import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { DOCUMENTS_DIR, PDF_FORMS_DIR } from '../paths.js';

export type PdfFormSource = 'template' | 'document';

export type PdfFormEntry = {
  name: string;
  filename: string;
  source: PdfFormSource;
  fieldCount: number;
};

const STOP_WORDS = new Set([
  'my',
  'the',
  'a',
  'an',
  'uploaded',
  'file',
  'pdf',
  'form',
  'for',
  'from',
]);

function normalizeFormName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/\s+/g, ' ');
}

function tokenizeQuery(query: string): string[] {
  return normalizeFormName(query)
    .split(/[\s_-]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function scorePdfFormMatch(name: string, query: string): number {
  const normalizedName = normalizeFormName(name);
  const normalizedQuery = normalizeFormName(query);
  const tokens = tokenizeQuery(query);

  let score = 0;

  if (normalizedName === normalizedQuery) score += 1_000;
  if (normalizedName.includes(normalizedQuery)) score += 500;
  if (normalizedQuery.includes(normalizedName)) score += 400;

  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 100;
  }

  return score;
}

async function countPdfFormFields(filePath: string): Promise<number> {
  try {
    const bytes = await readFile(filePath);
    const pdfDoc = await PDFDocument.load(bytes);
    return pdfDoc.getForm().getFields().length;
  } catch {
    return 0;
  }
}

async function listPdfFilesInDir(
  dir: string,
  source: PdfFormSource,
): Promise<PdfFormEntry[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: PdfFormEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) {
      continue;
    }

    const filePath = path.join(dir, entry.name);
    const fieldCount = await countPdfFormFields(filePath);

    if (fieldCount === 0) {
      continue;
    }

    const name = entry.name.replace(/\.pdf$/i, '');
    results.push({
      name,
      filename: entry.name,
      source,
      fieldCount,
    });
  }

  return results;
}

export async function listAllPdfForms(): Promise<PdfFormEntry[]> {
  const templates = await listPdfFilesInDir(PDF_FORMS_DIR, 'template');
  const documents = await listPdfFilesInDir(DOCUMENTS_DIR, 'document');

  const byName = new Map<string, PdfFormEntry>();

  for (const entry of [...templates, ...documents]) {
    const key = normalizeFormName(entry.name);
    const existing = byName.get(key);

    if (!existing || entry.fieldCount > existing.fieldCount) {
      byName.set(key, entry);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolvePdfFormLocation(
  pdfFormName: string,
): Promise<
  | { filePath: string; name: string; filename: string; source: PdfFormSource }
  | { error: string; suggestions?: string[] }
> {
  const forms = await listAllPdfForms();

  if (forms.length === 0) {
    return {
      error:
        'No fillable PDF forms found. Upload a PDF with form fields or add one to forms/pdf/.',
    };
  }

  const exact = forms.find(
    (form) => normalizeFormName(form.name) === normalizeFormName(pdfFormName),
  );
  if (exact) {
    return toResolvedLocation(exact);
  }

  const scored = forms
    .map((form) => ({
      form,
      score: scorePdfFormMatch(form.name, pdfFormName),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return toResolvedLocation(scored[0].form);
  }

  return {
    error: `No fillable PDF form matches "${pdfFormName}".`,
    suggestions: forms.map((form) => form.name),
  };
}

function toResolvedLocation(form: PdfFormEntry): {
  filePath: string;
  name: string;
  filename: string;
  source: PdfFormSource;
} {
  const baseDir = form.source === 'template' ? PDF_FORMS_DIR : DOCUMENTS_DIR;

  return {
    filePath: path.join(baseDir, form.filename),
    name: form.name,
    filename: form.filename,
    source: form.source,
  };
}

export async function isFillablePdf(buffer: Buffer): Promise<{
  fillable: boolean;
  fieldCount: number;
}> {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const fieldCount = pdfDoc.getForm().getFields().length;
    return { fillable: fieldCount > 0, fieldCount };
  } catch {
    return { fillable: false, fieldCount: 0 };
  }
}
