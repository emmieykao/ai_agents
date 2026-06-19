import '@/lib/load-env';
import { saveDocumentFile } from '@agent/lib/documents';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await saveDocumentFile(file.name, buffer);

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to upload file';
    const status = message.includes('Unsupported') ? 400 : 500;

    return Response.json({ error: message }, { status });
  }
}
