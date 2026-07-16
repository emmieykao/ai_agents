import { readFile } from 'node:fs/promises';
import '@/lib/load-env';
import { PDFDocument } from 'pdf-lib';
import { resolvePdfFormLocation } from '@agent/lib/pdf-form-resolve';

export type PdfFieldRect = {
  name: string;
  page: number;
  /** PDF user-space coordinates (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Field geometry for a PDF form: page sizes plus each field widget's
 * rectangle, so the client can overlay values at their true positions.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const resolved = await resolvePdfFormLocation(decodeURIComponent(name));

    if ('error' in resolved) {
      return Response.json(resolved, { status: 404 });
    }

    const doc = await PDFDocument.load(await readFile(resolved.filePath));
    const pages = doc.getPages();
    const pageRefs = pages.map((page) => page.ref);

    const fields: PdfFieldRect[] = [];
    for (const field of doc.getForm().getFields()) {
      for (const widget of field.acroField.getWidgets()) {
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        const page = pageRef ? pageRefs.findIndex((ref) => ref === pageRef) : 0;
        fields.push({
          name: field.getName(),
          page: page === -1 ? 0 : page,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return Response.json({
      name: resolved.name,
      pages: pages.map((page) => ({
        width: page.getWidth(),
        height: page.getHeight(),
      })),
      fields,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read PDF layout';
    return Response.json({ error: message }, { status: 500 });
  }
}
