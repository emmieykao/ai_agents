import '@/lib/load-env';
import { saveDocumentFile } from '@agent/lib/documents';
import { isFillablePdf } from '@agent/lib/pdf-form-resolve';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await saveDocumentFile(file.name, buffer);
    const fillable = await isFillablePdf(buffer);

    return Response.json(
      {
        document,
        fillableForm: fillable.fillable
          ? {
              name: document.name.replace(/\.pdf$/i, ''),
              fieldCount: fillable.fieldCount,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to upload file';
    const status = message.includes('Unsupported') ? 400 : 500;

    return Response.json({ error: message }, { status });
  }
}
