/**
 * Generate fillable AcroForm PDFs from JSON form definitions.
 *
 * Reads every definition in forms/definitions/*.json and writes a matching
 * fillable PDF to forms/pdf/<name>.pdf. PDF field names are the definition's
 * field ids, so the resume auto-mapper and the viewer's field-position
 * overlays work unchanged.
 *
 * Usage: npm run create-form-pdfs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFINITIONS_DIR = path.join(ROOT, 'forms', 'definitions');
const OUTPUT_DIR = path.join(ROOT, 'forms', 'pdf');

type FieldDef = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean' | 'textarea';
  required?: boolean;
  description?: string;
};

type FormDef = {
  name: string;
  title: string;
  description?: string;
  fields: FieldDef[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const BORDER = rgb(0.72, 0.72, 0.76);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function generateFormPdf(def: FormDef): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  // --- header ---
  page.drawText(def.title, { x: MARGIN, y: y - 20, size: 20, font: bold, color: INK });
  y -= 30;

  if (def.description) {
    for (const line of wrapText(def.description, helvetica, 9.5, CONTENT_WIDTH)) {
      page.drawText(line, { x: MARGIN, y: y - 12, size: 9.5, font: helvetica, color: MUTED });
      y -= 13;
    }
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color: BORDER,
  });
  y -= 22;

  // --- fields ---
  for (const field of def.fields) {
    const isTextarea = field.type === 'textarea';
    const isCheckbox = field.type === 'boolean';
    const boxHeight = isTextarea ? 72 : 26;
    const blockHeight = isCheckbox ? 26 : 13 + 4 + boxHeight;

    newPageIfNeeded(blockHeight + 16);

    const label = `${field.label.toUpperCase()}${field.required ? ' *' : ''}`;

    if (isCheckbox) {
      const checkbox = form.createCheckBox(field.id);
      checkbox.addToPage(page, {
        x: MARGIN,
        y: y - 16,
        width: 14,
        height: 14,
        borderColor: BORDER,
        borderWidth: 1,
      });
      page.drawText(label, {
        x: MARGIN + 22,
        y: y - 13,
        size: 8.5,
        font: bold,
        color: MUTED,
      });
      y -= blockHeight + 16;
      continue;
    }

    page.drawText(label, { x: MARGIN, y: y - 9, size: 8.5, font: bold, color: MUTED });
    if (field.description) {
      const hint = wrapText(field.description, helvetica, 8, CONTENT_WIDTH * 0.55)[0] ?? '';
      page.drawText(hint, {
        x: MARGIN + CONTENT_WIDTH * 0.42,
        y: y - 9,
        size: 8,
        font: helvetica,
        color: MUTED,
      });
    }
    y -= 17;

    const textField = form.createTextField(field.id);
    if (isTextarea) textField.enableMultiline();
    textField.addToPage(page, {
      x: MARGIN,
      y: y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      borderColor: BORDER,
      borderWidth: 1,
    });
    // Must come after addToPage — setFontSize needs the field's /DA entry.
    textField.setFontSize(isTextarea ? 10 : 11);
    y -= boxHeight + 18;
  }

  // --- footer on each page ---
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    p.drawText(`${def.title} — page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: MARGIN - 26,
      size: 8,
      font: helvetica,
      color: MUTED,
    });
  });

  return doc.save();
}

await mkdir(OUTPUT_DIR, { recursive: true });
const entries = await readdir(DEFINITIONS_DIR);

for (const entry of entries.filter((name) => name.endsWith('.json'))) {
  const def = JSON.parse(
    await readFile(path.join(DEFINITIONS_DIR, entry), 'utf-8'),
  ) as FormDef;
  const bytes = await generateFormPdf(def);
  const outPath = path.join(OUTPUT_DIR, `${def.name}.pdf`);
  await writeFile(outPath, bytes);
  console.log(`Created forms/pdf/${def.name}.pdf (${def.fields.length} fields)`);
}
