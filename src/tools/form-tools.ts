import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { readDocumentTextByName } from '../lib/document-content.js';
import { mapJsonFormValuesFromContent } from '../lib/pdf-form-mapper.js';
import { previewValue, reportProgress } from '../lib/progress.js';
import { COMPLETED_DIR, FORMS_DIR } from '../paths.js';

export { FORMS_DIR, COMPLETED_DIR };

const fieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'email', 'phone', 'date', 'number', 'boolean', 'textarea']),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const formSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
});

type FormDefinition = z.infer<typeof formSchema>;

function resolveFormPath(formName: string): string {
  const safeName = path.basename(formName.replace(/\.json$/, ''));
  const resolved = path.resolve(FORMS_DIR, `${safeName}.json`);

  if (!resolved.startsWith(FORMS_DIR)) {
    throw new Error('Invalid form path');
  }

  return resolved;
}

async function loadForm(formName: string): Promise<FormDefinition> {
  const filePath = resolveFormPath(formName);
  const raw = await readFile(filePath, 'utf-8');
  return formSchema.parse(JSON.parse(raw));
}

export const listForms = tool({
  description: 'List all form templates available in the forms folder',
  inputSchema: z.object({}),
  execute: async () => {
    await mkdir(FORMS_DIR, { recursive: true });
    const entries = await readdir(FORMS_DIR, { withFileTypes: true });
    const forms = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.replace(/\.json$/, ''));

    return { forms, count: forms.length };
  },
});

export const getForm = tool({
  description:
    'Get the field definitions for a form template (labels, types, required flags)',
  inputSchema: z.object({
    formName: z
      .string()
      .describe('Form name without .json, e.g. "contact-info"'),
  }),
  execute: async ({ formName }) => {
    try {
      const form = await loadForm(formName);
      return {
        name: form.name,
        title: form.title,
        description: form.description,
        fields: form.fields,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to load form',
      };
    }
  },
});

export const fillJsonFormFromSource = tool({
  description:
    'Preferred way to fill JSON forms. Reads a source document, maps resume/contact data to form field ids, and saves the completed form.',
  inputSchema: z.object({
    formName: z.string().describe('Form template name, e.g. "contact-info"'),
    sourceDocument: z
      .string()
      .describe('Source document filename or hint, e.g. "resume"'),
    notes: z.string().optional(),
  }),
  execute: async ({ formName, sourceDocument, notes }, options) => {
    const ctx = options?.experimental_context;
    try {
      reportProgress(ctx, {
        phase: 'resolve',
        label: `Finding the document you meant ("${sourceDocument}")`,
        formName,
      });
      const form = await loadForm(formName);
      const source = await readDocumentTextByName({
        filename: sourceDocument.includes('.') ? sourceDocument : undefined,
        hint: sourceDocument.includes('.') ? undefined : sourceDocument,
        keywords: ['resume', 'cv'],
      });

      if ('error' in source) {
        return source;
      }

      reportProgress(ctx, {
        phase: 'read',
        label: `Reading ${source.filename}`,
        detail: `${source.content.length.toLocaleString()} characters (${source.resolvedBy})`,
        formName: form.name,
      });

      reportProgress(ctx, {
        phase: 'map',
        label: `Matching resume details to the ${form.name} form`,
        formName: form.name,
      });
      const values = mapJsonFormValuesFromContent(form.fields, source.content);
      const nonEmptyCount = Object.values(values).filter(Boolean).length;

      // Name each field as it's filled, so the UI shows "Filling Phone Number…"
      // rather than an opaque count.
      for (const field of form.fields) {
        const value = values[field.id];
        if (value) {
          reportProgress(ctx, {
            phase: 'field',
            label: `Filling ${field.label}`,
            detail: previewValue(value),
            formName: form.name,
            fieldId: field.id,
          });
        }
      }

      if (nonEmptyCount === 0) {
        return {
          error:
            'Could not extract any values from the source document for this form.',
          sourceDocument: source.filename,
          formName: form.name,
        };
      }

      const missingRequired = form.fields
        .filter(
          (field) =>
            field.required &&
            (values[field.id] === undefined ||
              values[field.id] === null ||
              values[field.id] === ''),
        )
        .map((field) => field.id);

      const missingRequiredLabels = form.fields
        .filter((field) => missingRequired.includes(field.id))
        .map((field) => field.label);

      for (const label of missingRequiredLabels) {
        reportProgress(ctx, {
          phase: 'skip',
          label: `Couldn't find ${label} in the document`,
          formName: form.name,
        });
      }

      reportProgress(ctx, {
        phase: 'save',
        label: `Saving the completed ${form.name} form`,
        formName: form.name,
      });

      await mkdir(COMPLETED_DIR, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputName = `${form.name}-${timestamp}.json`;
      const outputPath = path.join(COMPLETED_DIR, outputName);

      const payload = {
        formName: form.name,
        title: form.title,
        completedAt: new Date().toISOString(),
        sourceDocuments: [source.filename],
        values,
        missingRequired,
        notes: notes ?? null,
      };

      await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');

      reportProgress(ctx, {
        phase: 'done',
        label: `Saved completed/${outputName}`,
        formName: form.name,
        file: `completed/${outputName}`,
      });

      return {
        savedTo: `completed/${outputName}`,
        missingRequired,
        fieldCount: nonEmptyCount,
        values,
        sourceDocument: source.filename,
        sourceResolvedBy: source.resolvedBy,
        sourceAlternatives: source.alternatives,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to fill form from source',
      };
    }
  },
});

export const saveCompletedForm = tool({
  description:
    'Save a completed form with field values. Use after reading source documents to extract answers.',
  inputSchema: z.object({
    formName: z.string().describe('Form template name, e.g. "contact-info"'),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe('Field id to value mapping'),
    sourceDocuments: z
      .array(z.string())
      .optional()
      .describe('Document filenames used to fill the form'),
    notes: z
      .string()
      .optional()
      .describe('Notes about missing fields or assumptions'),
  }),
  execute: async ({ formName, values, sourceDocuments, notes }) => {
    try {
      const form = await loadForm(formName);
      let resolvedValues = { ...values };

      const allEmpty = Object.values(resolvedValues).every(
        (value) => value === undefined || value === null || value === '',
      );

      if (allEmpty && sourceDocuments?.[0]) {
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
          resolvedValues = mapJsonFormValuesFromContent(
            form.fields,
            source.content,
          );
        }
      }

      const nonEmptyCount = Object.values(resolvedValues).filter(
        (value) => value !== undefined && value !== null && value !== '',
      ).length;

      if (nonEmptyCount === 0) {
        return {
          error:
            'No form fields were filled. Use fillJsonFormFromSource instead of saving empty values.',
          suggestion:
            'Call fillJsonFormFromSource with formName and sourceDocument set to your resume.',
        };
      }

      const missingRequired = form.fields
        .filter(
          (field) =>
            field.required &&
            (resolvedValues[field.id] === undefined ||
              resolvedValues[field.id] === null ||
              resolvedValues[field.id] === ''),
        )
        .map((field) => field.id);

      await mkdir(COMPLETED_DIR, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputName = `${form.name}-${timestamp}.json`;
      const outputPath = path.join(COMPLETED_DIR, outputName);

      const payload = {
        formName: form.name,
        title: form.title,
        completedAt: new Date().toISOString(),
        sourceDocuments: sourceDocuments ?? [],
        values: resolvedValues,
        missingRequired,
        notes: notes ?? null,
      };

      await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');

      return {
        savedTo: `completed/${outputName}`,
        missingRequired,
        fieldCount: nonEmptyCount,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to save form',
      };
    }
  },
});

function normalizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const updateCompletedForm = tool({
  description:
    'Update the most recently completed JSON form with additional or corrected field values (e.g. details the source document could not provide, like dates or preferences). Merges into the existing answers and saves a new version.',
  inputSchema: z.object({
    formName: z.string().describe('Form template name, e.g. "travel-request"'),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe('Field id (or label) to new value mapping — only the fields to add/change'),
    notes: z.string().optional(),
  }),
  execute: async ({ formName, values, notes }, options) => {
    const ctx = options?.experimental_context;
    try {
      const form = await loadForm(formName);

      // Find the latest completed version of this form.
      await mkdir(COMPLETED_DIR, { recursive: true });
      const entries = await readdir(COMPLETED_DIR, { withFileTypes: true });
      const candidates = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.startsWith(`${form.name}-`) &&
            entry.name.endsWith('.json'),
        )
        .map((entry) => entry.name)
        .sort()
        .reverse();

      let previous: { values?: Record<string, unknown>; sourceDocuments?: string[] } | null =
        null;
      let previousFile: string | null = null;
      for (const candidate of candidates) {
        const parsed = JSON.parse(
          await readFile(path.join(COMPLETED_DIR, candidate), 'utf-8'),
        );
        if (parsed?.formName === form.name && parsed?.values) {
          previous = parsed;
          previousFile = candidate;
          break;
        }
      }

      if (!previous || !previousFile) {
        return {
          error: `No completed "${form.name}" form found to update.`,
          suggestion:
            'Fill it first with fillJsonFormFromSource, then update it with the extra details.',
        };
      }

      // Merge: resolve incoming keys against field ids or labels.
      const merged: Record<string, unknown> = { ...previous.values };
      const unknownKeys: string[] = [];
      const updatedIds: string[] = [];

      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '') continue;
        const normalized = normalizeFieldKey(key);
        const field = form.fields.find(
          (candidate) =>
            candidate.id === key ||
            normalizeFieldKey(candidate.id) === normalized ||
            normalizeFieldKey(candidate.label) === normalized,
        );
        if (!field) {
          unknownKeys.push(key);
          continue;
        }
        merged[field.id] = value;
        updatedIds.push(field.id);
      }

      if (updatedIds.length === 0) {
        return {
          error: 'None of the provided keys matched this form’s fields.',
          unknownKeys,
          availableFields: form.fields.map((field) => ({
            id: field.id,
            label: field.label,
          })),
        };
      }

      reportProgress(ctx, {
        phase: 'map',
        label: `Updating ${form.name} with new details`,
        detail: updatedIds.join(', '),
        formName: form.name,
      });

      // Emit the FULL merged set so the viewer re-renders every answer.
      for (const field of form.fields) {
        const value = merged[field.id];
        if (value !== undefined && value !== null && value !== '') {
          reportProgress(ctx, {
            phase: 'field',
            label: `Filling ${field.label}`,
            detail: previewValue(value),
            formName: form.name,
            fieldId: field.id,
          });
        }
      }

      const missingRequired = form.fields
        .filter(
          (field) =>
            field.required &&
            (merged[field.id] === undefined ||
              merged[field.id] === null ||
              merged[field.id] === ''),
        )
        .map((field) => field.id);

      reportProgress(ctx, {
        phase: 'save',
        label: `Saving the updated ${form.name} form`,
        formName: form.name,
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputName = `${form.name}-${timestamp}.json`;
      const outputPath = path.join(COMPLETED_DIR, outputName);

      const payload = {
        formName: form.name,
        title: form.title,
        completedAt: new Date().toISOString(),
        sourceDocuments: previous.sourceDocuments ?? [],
        updatedFrom: `completed/${previousFile}`,
        values: merged,
        missingRequired,
        notes: notes ?? null,
      };

      await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');

      reportProgress(ctx, {
        phase: 'done',
        label: `Saved completed/${outputName}`,
        formName: form.name,
        file: `completed/${outputName}`,
      });

      return {
        savedTo: `completed/${outputName}`,
        updatedFrom: `completed/${previousFile}`,
        updatedFields: updatedIds,
        unknownKeys,
        missingRequired,
        values: merged,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Failed to update completed form',
      };
    }
  },
});

export const listCompletedForms = tool({
  description: 'List previously saved completed forms (JSON and PDF)',
  inputSchema: z.object({}),
  execute: async () => {
    await mkdir(COMPLETED_DIR, { recursive: true });
    const entries = await readdir(COMPLETED_DIR, { withFileTypes: true });
    const forms = entries
      .filter((e) => e.isFile() && (e.name.endsWith('.json') || e.name.toLowerCase().endsWith('.pdf')))
      .map((e) => e.name);

    return { completedForms: forms, count: forms.length };
  },
});

export const formTools = {
  listForms,
  getForm,
  fillJsonFormFromSource,
  saveCompletedForm,
  updateCompletedForm,
  listCompletedForms,
};
