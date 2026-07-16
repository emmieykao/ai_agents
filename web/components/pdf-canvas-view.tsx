'use client';

import { useEffect, useRef, useState } from 'react';
import { TypewriterText } from './typewriter-text';

export type PdfFieldRect = {
  name: string;
  page: number;
  /** PDF user-space coordinates (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfLayout = {
  name: string;
  pages: Array<{ width: number; height: number }>;
  fields: PdfFieldRect[];
};

type PdfCanvasViewProps = {
  /** URL of the PDF to render (template or completed output). */
  src: string;
  layout: PdfLayout | null;
  /** Revealed field values (fieldId → value), drawn at their true positions. */
  values: Map<string, string>;
  /** Field currently being "written", with typewriter timing. */
  currentField?: { id: string; text: string; durationMs: number } | null;
  /** Hide overlays once the real completed PDF (values baked in) is shown. */
  showOverlays: boolean;
};

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Load pdf.js once, client-side only, with its worker configured.
 *
 * Deliberately NOT bundled: webpack's processing of pdf.js breaks it at
 * runtime ("Object.defineProperty called on non-object"), so the runtime is
 * served as static files from public/pdfjs/ (copied by scripts/copy-pdfjs.mjs
 * on pre-dev/pre-build) and imported with webpackIgnore.
 */
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    // Path in a variable so neither TS nor webpack tries to resolve it at
    // build time — it only exists at runtime under public/.
    const runtimePath = '/pdfjs/pdf.min.mjs';
    pdfjsPromise = (
      import(/* webpackIgnore: true */ runtimePath) as Promise<PdfjsModule>
    ).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfCanvasView({
  src,
  layout,
  values,
  currentField,
  showOverlays,
}: PdfCanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the document or width changes, to re-run page rendering.
  const [renderTick, setRenderTick] = useState(0);
  const docRef = useRef<unknown>(null);

  // ---- observe container width (panel is user-resizable) ----
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      clearTimeout(timer);
      timer = setTimeout(() => setContainerWidth(width), 150);
    });
    observer.observe(element);
    setContainerWidth(element.clientWidth);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // ---- load the document ----
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNumPages(0);

    loadPdfjs()
      .then((pdfjs) => pdfjs.getDocument(src).promise)
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setRenderTick((tick) => tick + 1);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to render PDF',
          );
        }
      });

    return () => {
      cancelled = true;
      const doc = docRef.current as { destroy?: () => void } | null;
      docRef.current = null;
      doc?.destroy?.();
    };
  }, [src]);

  // ---- render pages to canvases ----
  useEffect(() => {
    const doc = docRef.current as {
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: unknown) => { promise: Promise<void>; cancel: () => void };
      }>;
    } | null;
    if (!doc || numPages === 0 || containerWidth < 50) return;

    let cancelled = false;
    const tasks: Array<{ cancel: () => void }> = [];

    (async () => {
      for (let index = 0; index < numPages; index++) {
        if (cancelled) return;
        const page = await doc.getPage(index + 1);
        const canvas = canvasRefs.current[index];
        if (!canvas || cancelled) continue;

        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = containerWidth / baseViewport.width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: cssScale * dpr });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';

        const context = canvas.getContext('2d');
        if (!context) continue;

        const task = page.render({ canvasContext: context, viewport });
        tasks.push(task);
        // Render pages sequentially; ignore cancellation exceptions.
        await task.promise.catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
      for (const task of tasks) task.cancel();
    };
  }, [numPages, containerWidth, renderTick]);

  // ---- auto-scroll to the field being written ----
  useEffect(() => {
    if (!currentField) return;
    const overlay = overlayRefs.current.get(currentField.id);
    overlay?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentField?.id, currentField]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full space-y-4 overflow-y-auto bg-[var(--background)] p-3">
      {numPages === 0 && (
        <p className="p-4 text-sm text-[var(--muted)]">Rendering PDF…</p>
      )}
      {Array.from({ length: numPages }, (_, pageIndex) => {
        const pageDims = layout?.pages[pageIndex];
        const pageFields =
          layout?.fields.filter((field) => field.page === pageIndex) ?? [];

        return (
          <div
            key={pageIndex}
            className="relative mx-auto overflow-hidden rounded border border-[var(--border)] bg-white shadow-sm"
            style={
              pageDims
                ? { aspectRatio: `${pageDims.width} / ${pageDims.height}` }
                : undefined
            }
          >
            <canvas
              ref={(node) => {
                canvasRefs.current[pageIndex] = node;
              }}
              className="block w-full"
            />

            {/* Field overlays: values drawn at their true PDF positions. */}
            {showOverlays &&
              pageDims &&
              pageFields.map((field) => {
                const value = values.get(field.name);
                const isCurrent = currentField?.id === field.name;
                if (!value && !isCurrent) return null;

                const cssScale = containerWidth / pageDims.width;
                const fontSize = Math.max(
                  8,
                  Math.min(field.height * cssScale * 0.55, 15),
                );
                const isMultiline = field.height * cssScale > fontSize * 2.4;

                return (
                  <div
                    key={`${field.name}-${field.x}-${field.y}`}
                    ref={(node) => {
                      if (node) overlayRefs.current.set(field.name, node);
                      else overlayRefs.current.delete(field.name);
                    }}
                    className={`absolute overflow-hidden px-[0.3%] leading-tight transition-shadow duration-300 ${
                      isCurrent
                        ? 'z-10 rounded-sm bg-blue-500/10 shadow-[0_0_0_2px_var(--accent)]'
                        : ''
                    } ${isMultiline ? '' : 'flex items-center'}`}
                    style={{
                      left: `${(field.x / pageDims.width) * 100}%`,
                      top: `${((pageDims.height - field.y - field.height) / pageDims.height) * 100}%`,
                      width: `${(field.width / pageDims.width) * 100}%`,
                      height: `${(field.height / pageDims.height) * 100}%`,
                      fontSize,
                    }}
                  >
                    <span className="animate-rise-in block w-full whitespace-pre-wrap break-words text-left font-medium text-blue-800 dark:text-blue-800">
                      {isCurrent && currentField ? (
                        <TypewriterText
                          text={currentField.text}
                          durationMs={currentField.durationMs}
                        />
                      ) : (
                        value
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
