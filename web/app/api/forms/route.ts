import '@/lib/load-env';
import { readdir } from 'node:fs/promises';
import { listAllPdfForms } from '@agent/lib/pdf-form-resolve';
import { FORMS_DIR } from '@agent/paths';

export async function GET() {
  try {
    const jsonEntries = await readdir(FORMS_DIR, { withFileTypes: true });
    const jsonForms = jsonEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/, ''));

    const pdfForms = await listAllPdfForms();

    const forms = [
      ...jsonForms.map((name) => ({
        name,
        kind: 'json' as const,
        label: name,
      })),
      ...pdfForms.map((form) => ({
        name: form.name,
        kind: 'pdf' as const,
        label:
          form.source === 'document'
            ? `${form.name} (uploaded PDF, ${form.fieldCount} fields)`
            : `${form.name} (PDF)`,
      })),
    ];

    return Response.json({ forms, count: forms.length });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to list forms',
      },
      { status: 500 },
    );
  }
}
