import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
import {
  listAllPdfForms,
  resolvePdfFormLocation,
} from '../lib/pdf-form-resolve.js';
import { readDocumentTextByName } from '../lib/document-content.js';
import { mapPdfFieldsFromContent } from '../lib/pdf-form-mapper.js';
import { previewValue, reportProgress } from '../lib/progress.js';
import { COMPLETED_DIR, PDF_FORMS_DIR } from '../paths.js';

export { PDF_FORMS_DIR, COMPLETED_DIR };

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

async function fillPdfFormInternal(options: {
  pdfFormName: string;
  values: Record<string, string | number | boolean | null>;
  sourceDocuments?: string[];
  notes?: string | null;
  flatten?: boolean;
}) {
  const resolved = await resolvePdfFormLocation(options.pdfFormName);

  if ('error' in resolved) {
    return resolved;
  }

  const bytes = await readFile(resolved.filePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fieldsByName = new Map(
    form.getFields().map((field) => [field.getName(), field]),
  );

  const filled: string[] = [];
  const skipped: Array<{ field: string; reason: string }> = [];
  const unknown: string[] = [];

  for (const [fieldName, value] of Object.entries(options.values)) {
    const field = fieldsByName.get(fieldName);
    if (!field) {
      unknown.push(fieldName);
      continue;
    }

    const result = setFieldValue(field, value);
    if (result.filled) filled.push(fieldName);
    else skipped.push({ field: fieldName, reason: result.reason ?? 'skipped' });
  }

  if (filled.length === 0) {
    return {
      error:
        'No PDF fields were filled. The values object was empty or field names did not match the PDF.',
      resolvedFormName: resolved.name,
      availableFieldExamples: form
        .getFields()
        .slice(0, 15)
        .map((field) => field.getName()),
      suggestion:
        'Use fillPdfFormFromSource instead — it maps resume data to PDF field names automatically.',
    };
  }

  if (options.flatten) {
    form.flatten();
  }

  await mkdir(COMPLETED_DIR, { recursive: true });

  const safeBaseName = resolved.name.replace(/[^\w.-]+/g, '-');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPdfName = `${safeBaseName}-${timestamp}.pdf`;
  const outputPdfPath = path.join(COMPLETED_DIR, outputPdfName);
  const outputMetaName = `${safeBaseName}-${timestamp}.json`;
  const outputMetaPath = path.join(COMPLETED_DIR, outputMetaName);

  const filledPdf = await pdfDoc.save();
  await writeFile(outputPdfPath, filledPdf);

  const metadata = {
    pdfFormName: resolved.name,
    completedAt: new Date().toISOString(),
    sourceDocuments: options.sourceDocuments ?? [],
    values: options.values,
    filledFields: filled,
    skippedFields: skipped,
    unknownFields: unknown,
    flattened: options.flatten ?? false,
    notes: options.notes ?? null,
  };

  await writeFile(outputMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');

  return {
    savedPdf: `completed/${outputPdfName}`,
    metadata: `completed/${outputMetaName}`,
    filledFieldCount: filled.length,
    skippedFields: skipped,
    unknownFields: unknown,
    resolvedFormName: resolved.name,
  };
}

function normalizePdfFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const updateCompletedPdfForm = tool({
  description:
    'Update the most recently completed PDF form with additional or corrected field values (details the source document could not provide). Merges into the existing answers and saves a new version of the PDF.',
  inputSchema: z.object({
    pdfFormName: z.string().describe('PDF form name, e.g. "Standard Application"'),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe('PDF field name to new value mapping — only the fields to add/change'),
    notes: z.string().optional(),
    flatten: z.boolean().optional(),
  }),
  execute: async ({ pdfFormName, values, notes, flatten = false }, options) => {
    const ctx = options?.experimental_context;
    try {
      const resolved = await resolvePdfFormLocation(pdfFormName);
      if ('error' in resolved) {
        return resolved;
      }

      // Latest completed metadata sidecar for this PDF form.
      const safeBaseName = resolved.name.replace(/[^\w.-]+/g, '-');
      await mkdir(COMPLETED_DIR, { recursive: true });
      const entries = await readdir(COMPLETED_DIR, { withFileTypes: true });
      const candidates = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.startsWith(`${safeBaseName}-`) &&
            entry.name.endsWith('.json'),
        )
        .map((entry) => entry.name)
        .sort()
        .reverse();

      let previous: {
        values?: Record<string, string | number | boolean | null>;
        sourceDocuments?: string[];
      } | null = null;
      let previousFile: string | null = null;
      for (const candidate of candidates) {
        const parsed = JSON.parse(
          await readFile(path.join(COMPLETED_DIR, candidate), 'utf-8'),
        );
        if (parsed?.pdfFormName === resolved.name && parsed?.values) {
          previous = parsed;
          previousFile = candidate;
          break;
        }
      }

      if (!previous?.values || !previousFile) {
        return {
          error: `No completed "${resolved.name}" PDF found to update.`,
          suggestion:
            'Fill it first with fillPdfFormFromSource, then update it with the extra details.',
        };
      }

      // Resolve incoming keys against actual PDF field names (exact or fuzzy).
      const bytes = await readFile(resolved.filePath);
      const pdfDoc = await PDFDocument.load(bytes);
      const fieldNames = pdfDoc.getForm().getFields().map((field) => field.getName());
      const byNormalized = new Map(
        fieldNames.map((name) => [normalizePdfFieldKey(name), name]),
      );

      const merged: Record<string, string | number | boolean | null> = {
        ...previous.values,
      };
      const unknownKeys: string[] = [];
      const updatedFields: string[] = [];

      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '') continue;
        const fieldName = fieldNames.includes(key)
          ? key
          : byNormalized.get(normalizePdfFieldKey(key));
        if (!fieldName) {
          unknownKeys.push(key);
          continue;
        }
        merged[fieldName] = value;
        updatedFields.push(fieldName);
      }

      if (updatedFields.length === 0) {
        return {
          error: 'None of the provided keys matched this PDF’s field names.',
          unknownKeys,
          availableFieldExamples: fieldNames.slice(0, 20),
          suggestion: 'Call getPdfFormFields to see the exact field names.',
        };
      }

      reportProgress(ctx, {
        phase: 'map',
        label: `Updating ${resolved.name} with new details`,
        detail: updatedFields.join(', '),
        formName: resolved.name,
      });

      // Emit the FULL merged set so the viewer re-renders every answer.
      for (const [fieldName, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === '') continue;
        reportProgress(ctx, {
          phase: 'field',
          label: `Filling ${fieldName}`,
          detail: previewValue(value),
          formName: resolved.name,
          fieldId: fieldName,
        });
      }

      reportProgress(ctx, {
        phase: 'save',
        label: `Writing the updated values into ${resolved.name}`,
        formName: resolved.name,
      });

      const result = await fillPdfFormInternal({
        pdfFormName,
        values: merged,
        sourceDocuments: previous.sourceDocuments ?? [],
        notes,
        flatten,
      });

      if ('error' in result) {
        return { ...result, updatedFrom: `completed/${previousFile}` };
      }

      reportProgress(ctx, {
        phase: 'done',
        label: `Saved ${result.savedPdf}`,
        formName: resolved.name,
        file: result.savedPdf,
      });

      return {
        ...result,
        updatedFrom: `completed/${previousFile}`,
        updatedFields,
        unknownKeys,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update completed PDF form',
      };
    }
  },
});

export const listPdfForms = tool({
  description:
    'List fillable PDF forms from forms/pdf/ and uploaded documents/ PDFs that contain AcroForm fields',
  inputSchema: z.object({}),
  execute: async () => {
    const forms = await listAllPdfForms();

    return {
      pdfForms: forms.map((form) => ({
        name: form.name,
        source: form.source,
        fieldCount: form.fieldCount,
        label:
          form.source === 'document'
            ? `${form.name} (uploaded PDF form)`
            : form.name,
      })),
      count: forms.length,
    };
  },
});

export const getPdfFormFields = tool({
  description:
    'Get fillable field names and types from a PDF form. Supports templates in forms/pdf/ and uploaded fillable PDFs in documents/ (e.g. "application" matches "Standard Application").',
  inputSchema: z.object({
    pdfFormName: z
      .string()
      .describe(
        'PDF form name without .pdf, e.g. "contact-info" or "Standard Application" or "application"',
      ),
  }),
  execute: async ({ pdfFormName }) => {
    try {
      const resolved = await resolvePdfFormLocation(pdfFormName);

      if ('error' in resolved) {
        return resolved;
      }

      const bytes = await readFile(resolved.filePath);
      const pdfDoc = await PDFDocument.load(bytes);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(describeField);

      if (fields.length === 0) {
        return {
          pdfFormName: resolved.name,
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
        pdfFormName: resolved.name,
        source: resolved.source,
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

export const fillPdfFormFromSource = tool({
  description:
    'Preferred way to fill PDF forms. Reads a resume/CV document, maps data to exact PDF field names, and saves the filled PDF. Use this instead of fillPdfForm with manual values.',
  inputSchema: z.object({
    pdfFormName: z
      .string()
      .describe('PDF form name, e.g. "Standard Application" or "application"'),
    sourceDocument: z
      .string()
      .describe('Source document filename or hint, e.g. "EmmieKao_Resume_College.pdf" or "resume"'),
    additionalValues: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe('Optional extra field values to merge on top of auto-mapped values'),
    notes: z.string().optional(),
    flatten: z.boolean().optional(),
  }),
  execute: async (
    { pdfFormName, sourceDocument, additionalValues, notes, flatten = false },
    options,
  ) => {
    const ctx = options?.experimental_context;
    try {
      reportProgress(ctx, {
        phase: 'resolve',
        label: `Finding the document you meant ("${sourceDocument}")`,
        formName: pdfFormName,
      });
      const source = await readDocumentTextByName({
        filename: sourceDocument.includes('.') ? sourceDocument : undefined,
        hint: sourceDocument.includes('.') ? undefined : sourceDocument,
        keywords: ['resume', 'cv'],
        useLatest: false,
      });

      if ('error' in source) {
        return source;
      }

      reportProgress(ctx, {
        phase: 'read',
        label: `Reading ${source.filename}`,
        detail: `${source.content.length.toLocaleString()} characters (${source.resolvedBy})`,
        formName: pdfFormName,
      });

      const resolved = await resolvePdfFormLocation(pdfFormName);
      if ('error' in resolved) {
        return resolved;
      }

      const bytes = await readFile(resolved.filePath);
      const pdfDoc = await PDFDocument.load(bytes);
      const fieldNames = pdfDoc.getForm().getFields().map((field) => field.getName());
      reportProgress(ctx, {
        phase: 'map',
        label: `Matching resume details to ${resolved.name}`,
        detail: `${fieldNames.length} PDF fields`,
        formName: resolved.name,
      });
      const mappedValues = mapPdfFieldsFromContent(fieldNames, source.content);
      const values = { ...mappedValues, ...additionalValues };

      const filledEntries = Object.entries(values).filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      );
      const nonEmptyCount = filledEntries.length;

      // Name each field as it's filled instead of showing an opaque count.
      for (const [fieldName, value] of filledEntries) {
        reportProgress(ctx, {
          phase: 'field',
          label: `Filling ${fieldName}`,
          detail: previewValue(value),
          formName: resolved.name,
          fieldId: fieldName,
        });
      }

      if (nonEmptyCount === 0) {
        return {
          error:
            'Could not extract any fillable values from the source document for this PDF form.',
          sourceDocument: source.filename,
          pdfFormName: resolved.name,
          suggestion:
            'Ensure the source document is a resume/CV with name, email, phone, education, etc.',
        };
      }

      reportProgress(ctx, {
        phase: 'save',
        label: `Writing the values into ${resolved.name}`,
        formName: resolved.name,
      });
      const result = await fillPdfFormInternal({
        pdfFormName,
        values,
        sourceDocuments: [source.filename],
        notes,
        flatten,
      });

      if ('error' in result) {
        return {
          ...result,
          autoMappedValues: mappedValues,
          sourceDocument: source.filename,
        };
      }

      reportProgress(ctx, {
        phase: 'done',
        label: `Saved ${result.savedPdf}`,
        formName: resolved.name,
        file: result.savedPdf,
      });

      return {
        ...result,
        autoMappedValues: mappedValues,
        sourceDocument: source.filename,
        sourceResolvedBy: source.resolvedBy,
        sourceAlternatives: source.alternatives,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to fill PDF from source',
      };
    }
  },
});

export const fillPdfForm = tool({
  description:
    'Fill a PDF form with values and save the result to completed/. Works with forms/pdf/ templates and uploaded fillable PDFs in documents/.',
  inputSchema: z.object({
    pdfFormName: z
      .string()
      .describe(
        'PDF form name, e.g. "contact-info", "Standard Application", or "application"',
      ),
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
      let resolvedValues = { ...values };

      if (
        Object.keys(resolvedValues).length === 0 &&
        sourceDocuments?.[0]
      ) {
        const source = await readDocumentTextByName({
          filename: sourceDocuments[0].includes('.')
            ? sourceDocuments[0]
            : undefined,
          hint: sourceDocuments[0].includes('.')
            ? undefined
            : sourceDocuments[0],
          keywords: ['resume', 'cv'],
        });

        if (!('error' in source)) {
          const formResolved = await resolvePdfFormLocation(pdfFormName);
          if (!('error' in formResolved)) {
            const bytes = await readFile(formResolved.filePath);
            const pdfDoc = await PDFDocument.load(bytes);
            const fieldNames = pdfDoc
              .getForm()
              .getFields()
              .map((field) => field.getName());
            resolvedValues = mapPdfFieldsFromContent(fieldNames, source.content);
          }
        }
      }

      return await fillPdfFormInternal({
        pdfFormName,
        values: resolvedValues,
        sourceDocuments,
        notes,
        flatten,
      });
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
  fillPdfFormFromSource,
  fillPdfForm,
  updateCompletedPdfForm,
};
