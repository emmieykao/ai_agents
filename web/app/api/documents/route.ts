import '@/lib/load-env';
import { listDocumentFiles } from '@agent/lib/documents';

export async function GET() {
  try {
    const documents = await listDocumentFiles();
    return Response.json({ documents, count: documents.length });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to list documents',
      },
      { status: 500 },
    );
  }
}
