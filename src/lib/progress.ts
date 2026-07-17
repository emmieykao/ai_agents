/**
 * Lightweight progress reporting so tools can stream fine-grained sub-steps
 * (e.g. "Reading resume", "Mapping fields") to the UI while they execute.
 *
 * The reporter is passed to tools via the AI SDK's `experimental_context`, and
 * the chat route forwards each event to the UI message stream as a
 * `data-progress` part.
 */
export type ProgressEvent = {
  /** Stable phase key: 'resolve' | 'read' | 'extract' | 'map' | 'field' | 'skip' | 'save' | 'search' | 'done'. */
  phase: string;
  /** Human-readable line shown in the activity panel. */
  label: string;
  /** Optional extra detail (e.g. filename, field count, field value preview). */
  detail?: string;
  /** Form this event belongs to, so UI panels can ignore unrelated fills. */
  formName?: string;
  /** For 'field' events: the field id/name being filled. */
  fieldId?: string;
  /** For 'done' events: repo-relative path of the saved output (e.g. "completed/x.pdf"). */
  file?: string;
};

export type ProgressReporter = (event: ProgressEvent) => void;

export type ToolContext = {
  onProgress?: ProgressReporter;
};

/** Short single-line preview of a field value for progress detail (long text is truncated). */
export function previewValue(value: unknown, maxLength = 60): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Safely invoke the progress reporter carried on a tool's experimental_context. */
export function reportProgress(context: unknown, event: ProgressEvent): void {
  const reporter = (context as ToolContext | undefined)?.onProgress;
  if (typeof reporter === 'function') {
    try {
      reporter(event);
    } catch {
      /* progress reporting must never break tool execution */
    }
  }
}
