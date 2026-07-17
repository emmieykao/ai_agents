/**
 * Monochrome line glyphs, sized to text. One stroke weight everywhere so the
 * activity ledger and field feed read as a single engraved system.
 */

export type GlyphName =
  | 'search'
  | 'page'
  | 'book'
  | 'funnel'
  | 'link'
  | 'pen'
  | 'alert'
  | 'save'
  | 'check'
  | 'cross'
  | 'arrow-up'
  | 'sun'
  | 'moon'
  | 'dot';

const PATHS: Record<GlyphName, React.ReactNode> = {
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.3 10.3 14 14" />
    </>
  ),
  page: (
    <>
      <path d="M4 1.5h5.5l2.5 2.5v10.5H4z" />
      <path d="M9.5 1.5V4H12" />
    </>
  ),
  book: (
    <>
      <path d="M2.5 3.2c1.8-1 3.7-1 5.5.2 1.8-1.2 3.7-1.2 5.5-.2v9.6c-1.8-1-3.7-1-5.5.2-1.8-1.2-3.7-1.2-5.5-.2z" />
      <path d="M8 3.4v9.6" />
    </>
  ),
  funnel: <path d="M2 2.5h12L9.8 8v4.8l-3.6 1.7V8z" />,
  link: (
    <>
      <path d="M6.8 4.6 8.2 3.2a2.6 2.6 0 0 1 3.7 3.7L10.4 8.3" />
      <path d="M9.2 11.4 7.8 12.8a2.6 2.6 0 0 1-3.7-3.7l1.5-1.4" />
      <path d="M6.4 9.6l3.2-3.2" />
    </>
  ),
  pen: (
    <>
      <path d="M2.5 13.5l.9-3.2L10.9 2.8a1.7 1.7 0 0 1 2.4 2.4L5.7 12.6z" />
      <path d="M9.9 3.8l2.4 2.4" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.2 14.2 13H1.8z" />
      <path d="M8 6.4v3" />
      <circle cx="8" cy="11.2" r="0.4" fill="currentColor" />
    </>
  ),
  save: (
    <>
      <path d="M2.5 2.5h9l2 2v9h-11z" />
      <path d="M5 2.5v3.5h5V2.5" />
      <path d="M5 13.5V9.5h6v4" />
    </>
  ),
  check: <path d="M3 8.6l3.4 3.4L13 4.6" />,
  cross: <path d="M4 4l8 8M12 4l-8 8" />,
  'arrow-up': (
    <>
      <path d="M8 13V3.5" />
      <path d="M4 7.2 8 3.2l4 4" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
    </>
  ),
  moon: <path d="M13.2 9.8A5.6 5.6 0 1 1 6.2 2.8a4.6 4.6 0 0 0 7 7z" />,
  dot: <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" />,
};

export function Glyph({
  name,
  className,
}: {
  name: GlyphName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? 'h-3.5 w-3.5'}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The Inkwell drop — the wordmark's companion. */
export function InkDrop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className ?? 'h-5 w-5'}>
      <path
        d="M16 3.5c3.4 4.8 6.2 8.5 6.2 12.2a6.2 6.2 0 1 1-12.4 0C9.8 12 12.6 8.3 16 3.5z"
        fill="currentColor"
      />
      <circle cx="16" cy="16.5" r="2.1" fill="var(--sheet)" />
    </svg>
  );
}

/** Small working spinner, drawn to match the line weight of the glyphs. */
export function Working({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${
        className ?? 'h-3 w-3'
      }`}
      aria-hidden
    />
  );
}
