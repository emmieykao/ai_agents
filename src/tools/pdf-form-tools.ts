import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
  type PDFField,
  StandardFonts,
} from 'pdf-lib';
import { tool } from 'ai';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PDF_FORMS_DIR = path.resolve(__dirname, '../../forms/pdf');
export const COMPLETED_DIR = path.resolve(__dirname, '../../completed');

function resolvePdfFormPath(filename: string): string {
  const safeName = path.basename(filename.replace(/\.pdf$/i, ''));
  const resolved = path.resolve(PDF_FORMS_DIR, `${safeName}.pdf`);

  if (!resolved.startsWith(PDF_FORMS_DIR)) {
    throw new Error('Invalid PDF form path');
  }

  return resolved;
}

function describeField(field: PDFField): {
  name: string;
  type: string;
} {
  if (field instanceof PDFTextField) {
    return { name: field.getName(), type: 'text' };
  }
  if (field instanceof PDFCheckBox) {
    return { name: field.getName(), type: 'checkbox' };
  }
  if (field instanceof PDFDropdown) {
    return {
      name: field.getName(),
      type: 'dropdown',
    };
  }
  if (field instanceof PDFRadioGroup) {
    return { name: field.getName(), type: 'radio' };
  }

  return { name: field.getName(), type: 'unknown' };
}

function setFieldValue(
  field: PDFField,
  value: string | number | boolean | null,
): { filled: boolean; reason?: string } {
  if (value === null || value === undefined || value === '') {
    return { filled: false, reason: 'empty value' };
  }

  if (field instanceof PDFTextField) {
    field.setText(String(value));
    return { filled: true };
  }

  if (field instanceof PDFCheckBox) {
    const checked =
      value === true ||
      value === 'true' ||
      value === 'yes' ||
      value === '1' ||
      value === 1;
    if (checked) field.check();
    else field.uncheck();
    return { filled: true };
  }

  if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
    field.select(String(value));
    return { filled: true };
  }

  return { filled: false, reason: 'unsupported field type' };
}

export const listPdfForms = tool({
  description:
    'List fillable PDF form templates in forms/pdf/ (.pdf files with AcroForm fields)',
  inputSchema: z.object({}),
  execute: async () => {
    await mkdir(PDF_FORMS_DIR, { recursive: true });
    const entries = await readdir(PDF_FORMS_DIR, { withFileTypes: true });
    const forms = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
      .map((e) => e.name.replace(/\.pdf$/i, ''));

    return { pdfForms: forms, count: forms.length };
  },
});

export const getPdfFormFields = tool({
  description:
    'Get fillable field names and types from a PDF form template in forms/pdf/',
  inputSchema: z.object({
    pdfFormName: z
      .string()
      .describe('PDF form name without .pdf, e.g. "contact-info"'),
  }),
  execute: async ({ pdfFormName }) => {
    try {
      const filePath = resolvePdfFormPath(pdfFormName);
      const bytes = await readFile(filePath);
      const pdfDoc = await PDFDocument.load(bytes);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(describeField);

      if (fields.length === 0) {
        return {
          pdfFormName,
          fields: [],
          warning:
            'This PDF has no fillable AcroForm fields. Use a PDF created with form fields (e.g. Adobe Acrobat, LibreOffice export).',
        };
      }

      const dropdownDetails = form.getFields().flatMap((field) => {
        if (!(field instanceof PDFDropdown)) return [];
        return [
          {
            name: field.getName(),
            options: field.getOptions(),
          },
        ];
      });

      return {
        pdfFormName,
        fields,
        dropdownOptions: dropdownDetails,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to read PDF form',
      };
    }
  },
});

export const fillPdfForm = tool({
  description:
    'Fill a PDF form template with values and save the result to completed/. Field names must match getPdfFormFields output.',
  inputSchema: z.object({
    pdfFormName: z.string().describe('PDF form template name, e.g. "contact-info"'),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe('PDF field name to value mapping'),
    sourceDocuments: z
      .array(z.string())
      .optional()
      .describe('Document filenames used to fill the form'),
    notes: z
      .string()
      .optional()
      .describe('Notes about missing fields or assumptions'),
    flatten: z
      .boolean()
      .optional()
      .describe('If true, flatten fields so they are no longer editable (default: false)'),
  }),
  execute: async ({
    pdfFormName,
    values,
    sourceDocuments,
    notes,
    flatten = false,
  }) => {
    try {
      const filePath = resolvePdfFormPath(pdfFormName);
      const bytes = await readFile(filePath);
      const pdfDoc = await PDFDocument.load(bytes);
      const form = pdfDoc.getForm();
      const fieldsByName = new Map(
        form.getFields().map((field) => [field.getName(), field]),
      );

      const filled: string[] = [];
      const skipped: Array<{ field: string; reason: string }> = [];
      const unknown: string[] = [];

      for (const [fieldName, value] of Object.entries(values)) {
        const field = fieldsByName.get(fieldName);
        if (!field) {
          unknown.push(fieldName);
          continue;
        }

        const result = setFieldValue(field, value);
        if (result.filled) filled.push(fieldName);
        else skipped.push({ field: fieldName, reason: result.reason ?? 'skipped' });
      }

      if (flatten) {
        form.flatten();
      }

      await mkdir(COMPLETED_DIR, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPdfName = `${pdfFormName}-${timestamp}.pdf`;
      const outputPdfPath = path.join(COMPLETED_DIR, outputPdfName);
      const outputMetaName = `${pdfFormName}-${timestamp}.json`;
      const outputMetaPath = path.join(COMPLETED_DIR, outputMetaName);

      const filledPdf = await pdfDoc.save();
      await writeFile(outputPdfPath, filledPdf);

      const metadata = {
        pdfFormName,
        completedAt: new Date().toISOString(),
        sourceDocuments: sourceDocuments ?? [],
        values,
        filledFields: filled,
        skippedFields: skipped,
        unknownFields: unknown,
        flattened: flatten,
        notes: notes ?? null,
      };

      await writeFile(outputMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');

      return {
        savedPdf: `completed/${outputPdfName}`,
        metadata: `completed/${outputMetaName}`,
        filledFieldCount: filled.length,
        skippedFields: skipped,
        unknownFields: unknown,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to fill PDF form',
      };
    }
  },
});

export async function createSampleContactPdfForm(): Promise<void> {
  await mkdir(PDF_FORMS_DIR, { recursive: true });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  page.drawText('Contact Information Form', {
    x: 50,
    y: 740,
    size: 18,
    font,
  });

  const fields: Array<{ name: string; label: string; y: number }> = [
    { name: 'full_name', label: 'Full Name', y: 680 },
    { name: 'email', label: 'Email', y: 630 },
    { name: 'phone', label: 'Phone', y: 580 },
    { name: 'address', label: 'Address', y: 530 },
    { name: 'organization', label: 'Organization', y: 480 },
    { name: 'job_title', label: 'Job Title', y: 430 },
  ];

  for (const { name, label, y } of fields) {
    page.drawText(label, { x: 50, y: y + 22, size: 11, font });
    const textField = form.createTextField(name);
    textField.addToPage(page, { x: 160, y, width: 360, height: 22 });
  }

  const consent = form.createCheckBox('consent');
  page.drawText('I agree to be contacted', { x: 50, y: 380, size: 11, font });
  consent.addToPage(page, { x: 160, y: 376, width: 16, height: 16 });

  const outputPath = path.join(PDF_FORMS_DIR, 'contact-info.pdf');
  await writeFile(outputPath, await pdfDoc.save());
}

export const pdfFormTools = {
  listPdfForms,
  getPdfFormFields,
  fillPdfForm,
};
