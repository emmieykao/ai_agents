'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat } from '@/components/chat';
import { DocumentSidebar } from '@/components/document-sidebar';
import { FormFillPanel } from '@/components/form-fill-panel';
import { FormViewerPanel } from '@/components/form-viewer-panel';
import { Glyph, InkDrop } from '@/components/icons';

const SIDEBAR_WIDTH_KEY = 'form-agent:sidebar-width';
const VIEWER_FRAC_KEY = 'form-agent:viewer-frac';
const THEME_KEY = 'inkwell:theme';

const GUTTER_PX = 12;
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MAX = 520;
/** Below this width the sidebar snaps closed (drag it right to reopen). */
const SIDEBAR_SNAP = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Vertical drag handle between sheets. Drag to resize, double-click to collapse/restore. */
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
      className="group hidden cursor-col-resize items-center justify-center lg:flex"
      style={{ width: GUTTER_PX }}
    >
      <div className="h-10 w-[2px] rounded-full bg-line-strong transition-colors group-hover:bg-pen group-active:bg-pen" />
    </div>
  );
}

/**
 * Day/night switch. Follows the OS preference until the user chooses;
 * the choice is stamped on <html data-theme> (also pre-paint, in layout.tsx)
 * and remembered.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    setTheme(
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light',
    );
  }, []);

  if (!theme) return null;

  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        localStorage.setItem(THEME_KEY, next);
        setTheme(next);
      }}
      title={next === 'dark' ? 'Switch to night' : 'Switch to day'}
      className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-pen"
    >
      <Glyph name={next === 'dark' ? 'moon' : 'sun'} className="h-3 w-3" />
      {next === 'dark' ? 'night' : 'day'}
    </button>
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
    <div className="mx-auto flex min-h-screen max-w-[110rem] flex-col px-4 py-5 sm:px-6 lg:h-screen">
      {/* Full-screen shield while dragging so the PDF iframe can't swallow pointer events. */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      {/* Letterhead */}
      <header className="enter mb-5 shrink-0">
        <div className="flex items-end justify-between gap-4 pb-3.5">
          <div className="flex items-baseline gap-2.5">
            <InkDrop className="h-[18px] w-[18px] self-center text-ink" />
            <h1 className="font-display text-[26px] font-semibold leading-none tracking-tight">
              Inkwell
            </h1>
            <p className="hidden font-display text-[15px] italic leading-none text-ink-soft sm:block">
              Forms, written for you.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
              {isChatLoading ? (
                <>
                  <span className="ink-pulse inline-block h-1.5 w-1.5 rounded-full bg-pen" />
                  <span className="text-pen">The agent is writing</span>
                </>
              ) : (
                'Ready'
              )}
            </p>
            <ThemeToggle />
          </div>
        </div>
        <div className="rule-draw h-px bg-line-strong" />
      </header>

      <div
        ref={containerRef}
        className={
          isDesktop
            ? 'flex min-h-0 flex-1 items-stretch'
            : 'flex flex-1 flex-col gap-4'
        }
      >
        {/* Left rail: the cabinet — documents on top, the fill desk pinned below. */}
        <div
          className="min-w-0 overflow-hidden"
          style={isDesktop ? { width: sidebarWidth, flexShrink: 0 } : undefined}
        >
          <div
            className="sheet enter flex h-full min-h-0 flex-col overflow-hidden"
            style={isDesktop ? { minWidth: 236, animationDelay: '60ms' } : { animationDelay: '60ms' }}
          >
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
            <div className="mx-4 h-px shrink-0 bg-line" />
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

        {/* The sheet: form being written */}
        <div
          className="flex min-h-0 min-w-0 flex-col"
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

        {/* Correspondence */}
        <div
          className="sheet enter flex min-h-[420px] min-w-0 flex-col overflow-hidden lg:min-h-0"
          style={
            isDesktop
              ? { flexGrow: 1 - viewerFrac, flexBasis: 0, animationDelay: '180ms' }
              : { animationDelay: '180ms' }
          }
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
