'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat } from '@/components/chat';
import { DocumentSidebar } from '@/components/document-sidebar';
import { FormFillPanel } from '@/components/form-fill-panel';
import { FormViewerPanel } from '@/components/form-viewer-panel';

const SIDEBAR_WIDTH_KEY = 'form-agent:sidebar-width';
const VIEWER_FRAC_KEY = 'form-agent:viewer-frac';

const GUTTER_PX = 10;
const SIDEBAR_DEFAULT = 280;
const SIDEBAR_MAX = 520;
/** Below this width the sidebar snaps closed (drag it right to reopen). */
const SIDEBAR_SNAP = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Vertical drag handle between panels. Drag to resize, double-click to collapse/restore. */
function Gutter({
  onPointerDown,
  onDoubleClick,
}: {
  onPointerDown: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · double-click to collapse"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="group hidden cursor-col-resize items-stretch justify-center lg:flex"
      style={{ width: GUTTER_PX }}
    >
      <div className="w-[3px] rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
    </div>
  );
}

export function AppShell() {
  const [selectedDocument, setSelectedDocument] = useState<string>();
  const [selectedForm, setSelectedForm] = useState<string>();
  const [selectedFormKind, setSelectedFormKind] = useState<'json' | 'pdf'>('json');
  const [fillTrigger, setFillTrigger] = useState(0);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [formsRefreshKey, setFormsRefreshKey] = useState(0);
  const [chatMessages, setChatMessages] = useState<UIMessage[]>([]);

  // ---- resizable layout state ----
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [viewerFrac, setViewerFrac] = useState(0.55);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSidebarWidth = useRef(SIDEBAR_DEFAULT);
  const lastViewerFrac = useRef(0.55);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);

    // Note: getItem() returns null when unset, and Number(null) === 0 — guard
    // against treating "never saved" as "sidebar collapsed to 0".
    const rawWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (rawWidth !== null) {
      const storedWidth = Number(rawWidth);
      if (Number.isFinite(storedWidth) && storedWidth >= 0 && storedWidth <= SIDEBAR_MAX) {
        setSidebarWidth(storedWidth);
        if (storedWidth > 0) lastSidebarWidth.current = storedWidth;
      }
    }
    const storedFrac = Number(localStorage.getItem(VIEWER_FRAC_KEY) ?? NaN);
    if (Number.isFinite(storedFrac) && storedFrac >= 0.1 && storedFrac <= 0.9) {
      setViewerFrac(storedFrac);
      lastViewerFrac.current = storedFrac;
    }

    return () => media.removeEventListener('change', update);
  }, []);

  const startSidebarDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      setIsDragging(true);

      const onMove = (move: PointerEvent) => {
        const next = startWidth + (move.clientX - startX);
        setSidebarWidth(next < SIDEBAR_SNAP ? 0 : clamp(next, SIDEBAR_SNAP, SIDEBAR_MAX));
      };
      const onUp = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', onMove);
        setSidebarWidth((width) => {
          if (width > 0) lastSidebarWidth.current = width;
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
          return width;
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [sidebarWidth],
  );

  const startSplitDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startFrac = viewerFrac;
      const container = containerRef.current?.getBoundingClientRect();
      const innerWidth = container
        ? container.width - sidebarWidth - GUTTER_PX * 2
        : 1000;
      setIsDragging(true);

      const onMove = (move: PointerEvent) => {
        const delta = (move.clientX - startX) / Math.max(innerWidth, 1);
        setViewerFrac(clamp(startFrac + delta, 0.15, 0.85));
      };
      const onUp = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', onMove);
        setViewerFrac((frac) => {
          lastViewerFrac.current = frac;
          localStorage.setItem(VIEWER_FRAC_KEY, String(frac));
          return frac;
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [viewerFrac, sidebarWidth],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarWidth((width) => {
      const next = width === 0 ? lastSidebarWidth.current || SIDEBAR_DEFAULT : 0;
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
      return next;
    });
  }, []);

  const toggleSplit = useCallback(() => {
    setViewerFrac((frac) => {
      // Cycle: current → viewer-max → chat-max → remembered split.
      const next =
        frac < 0.8 ? 0.85 : frac >= 0.8 ? clamp(lastViewerFrac.current, 0.15, 0.79) : 0.55;
      localStorage.setItem(VIEWER_FRAC_KEY, String(next));
      return next;
    });
  }, []);

  const handleSelectForm = useCallback((name: string, kind: 'json' | 'pdf') => {
    setSelectedForm(name);
    setSelectedFormKind(kind);
  }, []);

  const documentKeywords =
    selectedForm === 'contact-info' ||
    selectedForm?.toLowerCase().includes('application')
      ? ['resume', 'cv']
      : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-[110rem] flex-col px-4 py-6">
      {/* Full-screen shield while dragging so the PDF iframe can't swallow pointer events. */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      <header className="mb-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Form Agent</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload a document, pick a form, and let the agent fill it for you.
          <span className="hidden lg:inline"> Drag the dividers to resize panels.</span>
        </p>
      </header>

      <div
        ref={containerRef}
        className={isDesktop ? 'flex min-h-0 flex-1 items-stretch' : 'flex flex-1 flex-col gap-4'}
      >
        {/* Sidebar */}
        <div
          className="min-w-0 overflow-hidden"
          style={isDesktop ? { width: sidebarWidth, flexShrink: 0 } : undefined}
        >
          <div className="flex flex-col gap-4" style={isDesktop ? { minWidth: 220 } : undefined}>
            <DocumentSidebar
              selectedDocument={selectedDocument}
              preferredDocumentKeywords={documentKeywords}
              onSelectDocument={setSelectedDocument}
              onDocumentUploaded={(name) => setSelectedDocument(name)}
              onUploadComplete={({ document, fillableForm }) => {
                if (fillableForm) {
                  setSelectedForm(fillableForm.name);
                  setSelectedFormKind('pdf');
                  setFormsRefreshKey((value) => value + 1);
                } else {
                  setSelectedDocument(document.name);
                }
              }}
            />
            <FormFillPanel
              refreshKey={formsRefreshKey}
              selectedDocument={selectedDocument}
              selectedForm={selectedForm}
              selectedFormKind={selectedFormKind}
              onSelectForm={handleSelectForm}
              onFillForm={() => setFillTrigger((value) => value + 1)}
              isLoading={isChatLoading}
            />
          </div>
        </div>

        <Gutter onPointerDown={startSidebarDrag} onDoubleClick={toggleSidebar} />

        {/* Form viewer */}
        <div
          className="flex min-w-0 flex-col"
          style={isDesktop ? { flexGrow: viewerFrac, flexBasis: 0 } : undefined}
        >
          <FormViewerPanel
            selectedForm={selectedForm}
            selectedFormKind={selectedFormKind}
            messages={chatMessages}
            onSelectForm={handleSelectForm}
          />
        </div>

        <Gutter onPointerDown={startSplitDrag} onDoubleClick={toggleSplit} />

        {/* Chat */}
        <div
          className="flex min-w-0 flex-col"
          style={isDesktop ? { flexGrow: 1 - viewerFrac, flexBasis: 0 } : undefined}
        >
          <Chat
            selectedDocument={selectedDocument}
            selectedForm={selectedForm}
            selectedFormKind={selectedFormKind}
            fillTrigger={fillTrigger}
            onLoadingChange={setIsChatLoading}
            onMessagesChange={setChatMessages}
          />
        </div>
      </div>
    </div>
  );
}
