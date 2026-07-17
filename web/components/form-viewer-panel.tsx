'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractProgressSteps,
  type ProgressStep,
} from './agent-activity';
import { Glyph, Working } from './icons';
import { PdfCanvasView, type PdfLayout } from './pdf-canvas-view';
import { TypewriterText } from './typewriter-text';

type JsonFormField = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
};

type JsonFormDefinition = {
  name: string;
  title: string;
  description?: string;
  fields: JsonFormField[];
};

type FormEntry = {
  name: string;
  kind: 'json' | 'pdf';
  label: string;
};

type FormViewerPanelProps = {
  selectedForm?: string;
  selectedFormKind?: 'json' | 'pdf';
  messages: UIMessage[];
  onSelectForm?: (name: string, kind: 'json' | 'pdf') => void;
};

type AnimStyle = 'typewriter' | 'fade' | 'instant';

const ANIM_STYLE_KEY = 'form-agent:anim-style';
const ANIM_SPEED_KEY = 'form-agent:anim-speed';

const ANIM_STYLES: Array<{ value: AnimStyle; label: string }> = [
  { value: 'typewriter', label: 'type' },
  { value: 'fade', label: 'fade' },
  { value: 'instant', label: 'instant' },
];

const SPEEDS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
];

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function namesRoughlyMatch(a?: string, b?: string): boolean {
  if (!a || !b) return true; // missing info — don't block the replay
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function prettifyName(name: string): string {
  return name.replace(/[-_]+/g, ' ');
}

/** Segmented text control used for the animation style and speed pickers. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  title,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  title: string;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      title={title}
      className="flex overflow-hidden rounded-md border border-line"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`px-2 py-1 font-mono text-[10px] transition-colors ${
              isActive
                ? 'bg-ink text-sheet'
                : 'text-ink-soft hover:bg-sheet-tint'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The cinnabar seal pressed onto the sheet when a form is filed. */
function FiledSeal({
  fieldCount,
  href,
}: {
  fieldCount: number;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Open the completed file"
      className="stamp-in seal-stamp absolute right-5 top-5 z-20 block h-[88px] w-[88px] text-seal transition-transform hover:scale-[1.03]"
    >
      <svg viewBox="0 0 104 104" className="h-full w-full" aria-hidden>
        <circle
          cx="52"
          cy="52"
          r="49"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.9"
        />
        <circle
          cx="52"
          cy="52"
          r="36.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity="0.9"
        />
        <defs>
          <path id="seal-arc" d="M52 9.5a42.5 42.5 0 1 1-0.01 0" fill="none" />
        </defs>
        <text
          fontSize="10"
          letterSpacing="3.4"
          fill="currentColor"
          fontFamily="var(--font-plex-mono), ui-monospace, monospace"
          opacity="0.95"
        >
          <textPath href="#seal-arc">FILED · INKWELL · FILED ·</textPath>
        </text>
        <text
          x="52"
          y="52"
          textAnchor="middle"
          fontSize="21"
          fontWeight="600"
          fill="currentColor"
          fontFamily="var(--font-plex-mono), ui-monospace, monospace"
        >
          {fieldCount}
        </text>
        <text
          x="52"
          y="65"
          textAnchor="middle"
          fontSize="7.5"
          letterSpacing="2.6"
          fill="currentColor"
          fontFamily="var(--font-plex-mono), ui-monospace, monospace"
        >
          FIELDS
        </text>
      </svg>
      <span className="sr-only">Form filed — open the completed file</span>
    </a>
  );
}

export function FormViewerPanel({
  selectedForm,
  selectedFormKind = 'json',
  messages,
  onSelectForm,
}: FormViewerPanelProps) {
  // ---- available forms, for the welcome screen ----
  const [availableForms, setAvailableForms] = useState<FormEntry[]>([]);

  useEffect(() => {
    if (selectedForm) return;
    let cancelled = false;
    fetch('/api/forms')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.forms)) {
          setAvailableForms(data.forms as FormEntry[]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedForm]);

  // ---- animation preferences (persisted) ----
  const [animStyle, setAnimStyle] = useState<AnimStyle>('typewriter');
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const storedStyle = localStorage.getItem(ANIM_STYLE_KEY);
    if (storedStyle === 'typewriter' || storedStyle === 'fade' || storedStyle === 'instant') {
      setAnimStyle(storedStyle);
    }
    const storedSpeed = Number(localStorage.getItem(ANIM_SPEED_KEY));
    if (storedSpeed === 0.5 || storedSpeed === 1 || storedSpeed === 2) {
      setSpeed(storedSpeed);
    }
  }, []);

  const updateStyle = (style: AnimStyle) => {
    setAnimStyle(style);
    localStorage.setItem(ANIM_STYLE_KEY, style);
  };
  const updateSpeed = (value: number) => {
    setSpeed(value);
    localStorage.setItem(ANIM_SPEED_KEY, String(value));
  };

  // ---- latest fill run (progress steps from the newest message that has any) ----
  const steps = useMemo(() => extractProgressSteps(messages), [messages]);

  const run = useMemo(() => {
    if (steps.length === 0) return null;
    const lastMessageId = steps[steps.length - 1].messageId;
    const runSteps = steps.filter((s) => s.messageId === lastMessageId);
    const formName = runSteps.find((s) => s.formName)?.formName;
    if (!namesRoughlyMatch(formName, selectedForm)) return null;
    return { id: lastMessageId, steps: runSteps, formName };
  }, [steps, selectedForm]);

  const fieldSteps = useMemo(
    () => (run ? run.steps.filter((s) => s.phase === 'field') : []),
    [run],
  );
  const skipSteps = useMemo(
    () => (run ? run.steps.filter((s) => s.phase === 'skip') : []),
    [run],
  );
  const doneStep = run?.steps.find((s) => s.phase === 'done' && s.file);

  // ---- replay: reveal fields one at a time as a visual walkthrough ----
  const [revealed, setRevealed] = useState(0);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (run && runIdRef.current !== run.id) {
      runIdRef.current = run.id;
      setRevealed(animStyle === 'instant' ? fieldSteps.length : 0);
    }
  }, [run, animStyle, fieldSteps.length]);

  // How long the current field's animation runs before advancing.
  const currentStep: ProgressStep | undefined = fieldSteps[revealed];
  const stepDelayMs = useMemo(() => {
    if (animStyle === 'instant') return 0;
    const valueLength = currentStep?.detail?.length ?? 0;
    const base =
      animStyle === 'typewriter' ? 300 + valueLength * 30 : 400;
    return Math.min(base / speed, 5000);
  }, [animStyle, speed, currentStep]);

  useEffect(() => {
    if (animStyle === 'instant') {
      setRevealed(fieldSteps.length);
      return;
    }
    if (revealed < fieldSteps.length) {
      const timer = setTimeout(
        () => setRevealed((count) => count + 1),
        stepDelayMs,
      );
      return () => clearTimeout(timer);
    }
  }, [revealed, fieldSteps.length, animStyle, stepDelayMs]);

  const replayDone = revealed >= fieldSteps.length;
  const completedFile = replayDone && doneStep?.file ? doneStep.file : null;
  const completedBasename = completedFile?.split('/').pop() ?? null;
  const isFilling = Boolean(run) && !replayDone;
  const currentField = isFilling ? currentStep : null;

  // Values revealed so far, for the JSON form view.
  const revealedValues = useMemo(() => {
    const map = new Map<string, string>();
    for (const step of fieldSteps.slice(0, revealed)) {
      if (step.fieldId) map.set(step.fieldId, step.detail ?? '');
    }
    return map;
  }, [fieldSteps, revealed]);

  // ---- PDF field geometry, for drawing values at their true positions ----
  const [pdfLayout, setPdfLayout] = useState<PdfLayout | null>(null);

  useEffect(() => {
    setPdfLayout(null);
    if (!selectedForm || selectedFormKind !== 'pdf') return;

    let cancelled = false;
    fetch(`/api/pdf-form-layout/${encodeURIComponent(selectedForm)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.fields) setPdfLayout(data as PdfLayout);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedForm, selectedFormKind]);

  // ---- JSON form definition (fallback view for non-PDF forms) ----
  const [jsonForm, setJsonForm] = useState<JsonFormDefinition | null>(null);

  useEffect(() => {
    setJsonForm(null);
    if (!selectedForm || selectedFormKind !== 'json') return;

    let cancelled = false;
    fetch(`/api/forms/${encodeURIComponent(selectedForm)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.fields) setJsonForm(data as JsonFormDefinition);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedForm, selectedFormKind]);

  // ---- status line ----
  const status = !selectedForm
    ? 'pick a form to begin'
    : isFilling
      ? `writing — ${currentField?.label.replace(/^Filling /, '') ?? '…'}`
      : completedFile
        ? 'filed'
        : 'blank';

  return (
    <section className="sheet enter flex min-h-[480px] flex-1 flex-col overflow-hidden lg:min-h-0" style={{ animationDelay: '120ms' }}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-display text-[17px] font-medium leading-tight">
              {selectedForm ? prettifyName(selectedForm) : 'The sheet'}
            </h2>
            {selectedForm && (
              <span className="shrink-0 rounded-sm border border-line px-1 py-px font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                {selectedFormKind}
              </span>
            )}
          </div>
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
              completedFile ? 'text-seal' : isFilling ? 'text-pen' : 'text-ink-faint'
            }`}
          >
            {status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedForm && (
            <>
              <Segmented
                options={ANIM_STYLES}
                value={animStyle}
                onChange={updateStyle}
                title="Fill animation style"
              />
              {animStyle !== 'instant' && (
                <Segmented
                  options={SPEEDS}
                  value={speed}
                  onChange={updateSpeed}
                  title="Animation speed"
                />
              )}
            </>
          )}
          {isFilling && <Working className="h-3 w-3 text-pen" />}
          {completedFile && (
            <a
              href={`/api/completed-file/${encodeURIComponent(completedBasename ?? '')}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10.5px] text-pen hover:underline"
            >
              open file ↗
            </a>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {completedFile && (
          <FiledSeal
            fieldCount={fieldSteps.length}
            href={`/api/completed-file/${encodeURIComponent(completedBasename ?? '')}`}
          />
        )}

        {!selectedForm ? (
          <div className="h-full overflow-y-auto px-7 py-8 sm:px-9">
            <h3 className="max-w-md font-display text-[30px] font-medium leading-[1.15] tracking-tight">
              Paperwork,{' '}
              <em className="italic text-pen">written for you.</em>
            </h3>
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
              Add a document, choose a form, and watch it fill itself — line by
              line, in ink. Anything the document can&apos;t answer, tell the
              agent in the conversation.
            </p>

            <ol className="mt-6 max-w-md space-y-2 text-[13px] text-ink-soft">
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-pen">1</span>
                Drop a source document on the left — a resume works well
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-pen">2</span>
                Choose a form here or from the picker
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-pen">3</span>
                Press “Fill from document” and watch the writing happen
              </li>
            </ol>

            <h4 className="eyebrow mt-10">Available forms</h4>
            {availableForms.length === 0 ? (
              <p className="mt-3 font-display text-[13.5px] italic text-ink-faint">
                Fetching forms…
              </p>
            ) : (
              <ul className="mt-2 max-w-lg">
                {availableForms.map((form) => (
                  <li key={`${form.kind}:${form.name}`}>
                    <button
                      type="button"
                      onClick={() => onSelectForm?.(form.name, form.kind)}
                      className="group flex w-full items-baseline justify-between gap-3 border-b border-line py-2.5 text-left transition-colors hover:border-line-strong"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-[15px] capitalize transition-colors group-hover:text-pen">
                          {prettifyName(form.name)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">
                        {form.kind}
                        <span
                          aria-hidden
                          className="text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          →
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : selectedFormKind === 'pdf' ? (
          <PdfCanvasView
            src={
              completedBasename?.endsWith('.pdf')
                ? `/api/completed-file/${encodeURIComponent(completedBasename)}`
                : `/api/pdf-form-file/${encodeURIComponent(selectedForm)}`
            }
            layout={pdfLayout}
            values={revealedValues}
            currentField={
              isFilling && currentField?.fieldId
                ? {
                    id: currentField.fieldId,
                    // Typewriter mode types the value in place; other styles
                    // just highlight the field until its value appears.
                    text:
                      animStyle === 'typewriter'
                        ? (currentField.detail ?? '')
                        : '',
                    durationMs: stepDelayMs,
                  }
                : null
            }
            // Once the real completed PDF (values baked in) is shown, the
            // overlays would double-print — hide them.
            showOverlays={!completedBasename?.endsWith('.pdf')}
          />
        ) : (
          <div className="h-full overflow-y-auto px-6 py-5 sm:px-8">
            {!jsonForm && (
              <p className="font-display text-[13.5px] italic text-ink-faint">
                Unfolding the form…
              </p>
            )}
            {jsonForm && (
              <div className="mb-6">
                <h3 className="font-display text-[21px] font-medium tracking-tight">
                  {jsonForm.title}
                </h3>
                {jsonForm.description && (
                  <p className="mt-1 text-[12.5px] text-ink-soft">
                    {jsonForm.description}
                  </p>
                )}
              </div>
            )}
            <div className="max-w-xl space-y-5 pb-6">
              {jsonForm?.fields.map((field) => {
                const value = revealedValues.get(field.id);
                const isCurrent = currentField?.fieldId === field.id;
                const missed =
                  replayDone &&
                  run &&
                  !value &&
                  skipSteps.some((s) => s.label.includes(field.label));
                return (
                  <div key={field.id}>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                      {field.label}
                      {field.required && <span className="text-seal"> *</span>}
                    </p>
                    <p
                      className={`min-h-[1.6rem] border-b pb-1 pt-0.5 font-mono text-[13px] transition-colors duration-300 ${
                        isCurrent
                          ? 'border-pen'
                          : value
                            ? 'border-line-strong'
                            : 'border-line'
                      }`}
                    >
                      {value ? (
                        <span className="animate-rise-in inline-block text-pen">
                          {value}
                        </span>
                      ) : isCurrent ? (
                        animStyle === 'typewriter' && currentField?.detail ? (
                          <span className="text-pen">
                            <TypewriterText
                              text={currentField.detail}
                              durationMs={stepDelayMs}
                            />
                          </span>
                        ) : (
                          <span className="ink-pulse text-pen">writing…</span>
                        )
                      ) : missed ? (
                        <span className="font-display text-[13px] italic text-amber">
                          not found in the document
                        </span>
                      ) : (
                        <span aria-hidden>&nbsp;</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Field feed strip for PDF mode, where values can't be shown in place (Tier A). */}
      {selectedFormKind === 'pdf' && run && fieldSteps.length > 0 && (
        <footer className="shrink-0 border-t border-line px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto font-mono text-[10.5px]">
            {fieldSteps.slice(0, revealed).slice(-3).map((step) => (
              <span
                key={step.id}
                className="animate-rise-in flex shrink-0 items-center gap-1.5 rounded-full bg-sheet-tint px-2.5 py-1 text-ink-soft"
              >
                <Glyph name="pen" className="h-2.5 w-2.5" />
                {step.label.replace(/^Filling /, '')}
                {step.detail ? `: ${step.detail}` : ''}
              </span>
            ))}
            {isFilling && currentField && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-pen px-2.5 py-1 text-pen">
                <Glyph name="pen" className="h-2.5 w-2.5" />
                {currentField.label.replace(/^Filling /, '')}:{' '}
                {animStyle === 'typewriter' && currentField.detail ? (
                  <TypewriterText
                    text={currentField.detail}
                    durationMs={stepDelayMs}
                  />
                ) : (
                  <span className="ink-pulse">…</span>
                )}
              </span>
            )}
            {replayDone && completedFile && (
              <span className="flex shrink-0 items-center gap-1.5 text-seal">
                <Glyph name="check" className="h-3 w-3" />
                {fieldSteps.length} fields · filed
              </span>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
