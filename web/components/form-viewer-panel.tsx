'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractProgressSteps,
  type ProgressStep,
} from './agent-activity';
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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function namesRoughlyMatch(a?: string, b?: string): boolean {
  if (!a || !b) return true; // missing info — don't block the replay
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
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
    ? 'Pick a form to get started'
    : isFilling
      ? `Filling ${currentField?.label.replace(/^Filling /, '') ?? '…'}`
      : completedFile
        ? 'Completed'
        : 'Blank template';

  return (
    <section className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {selectedForm ?? 'Form preview'}
            {selectedForm && (
              <span className="ml-2 rounded bg-[var(--background)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {selectedFormKind}
              </span>
            )}
          </h2>
          <p className="text-xs text-[var(--muted)]">{status}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="anim-style">
            Fill animation style
          </label>
          <select
            id="anim-style"
            value={animStyle}
            onChange={(event) => updateStyle(event.currentTarget.value as AnimStyle)}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs text-[var(--muted)] outline-none focus:border-[var(--accent)]"
            title="Fill animation style"
          >
            <option value="typewriter">⌨️ Typewriter</option>
            <option value="fade">✨ Fade</option>
            <option value="instant">⚡ Instant</option>
          </select>
          {animStyle !== 'instant' && (
            <select
              value={speed}
              onChange={(event) => updateSpeed(Number(event.currentTarget.value))}
              className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-xs text-[var(--muted)] outline-none focus:border-[var(--accent)]"
              title="Animation speed"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          )}
          {isFilling && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          )}
          {completedFile && (
            <a
              href={`/api/completed-file/${encodeURIComponent(completedBasename ?? '')}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 hover:underline dark:bg-green-950 dark:text-green-200"
            >
              Saved ✓ — open
            </a>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {!selectedForm ? (
          <div className="h-full overflow-y-auto p-6">
            <h3 className="text-lg font-semibold">
              Fill out forms automatically from your documents
            </h3>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-[var(--muted)]">
              <li>Upload or pick a source document on the left (e.g. a resume)</li>
              <li>Choose a form below or from the dropdown</li>
              <li>
                Click &quot;Fill form from document&quot; — and watch it fill in
                right here
              </li>
            </ol>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You can also just ask in the chat — e.g.{' '}
              <em>&quot;fill the travel request using resume 2&quot;</em>. For
              details a document can&apos;t provide (dates, SSN, preferences),
              include them in your message.
            </p>

            <h4 className="mt-6 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Available forms
            </h4>
            {availableForms.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Loading forms…</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {availableForms.map((form) => (
                  <button
                    key={`${form.kind}:${form.name}`}
                    type="button"
                    onClick={() => onSelectForm?.(form.name, form.kind)}
                    className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-left transition-colors hover:border-[var(--accent)]"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {form.name}
                      </span>
                      <span className="shrink-0 rounded bg-[var(--card)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        {form.kind}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                      {form.label}
                    </span>
                  </button>
                ))}
              </div>
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
          <div className="h-full space-y-3 overflow-y-auto p-4">
            {!jsonForm && (
              <p className="text-sm text-[var(--muted)]">Loading form…</p>
            )}
            {jsonForm?.fields.map((field) => {
              const value = revealedValues.get(field.id);
              const isCurrent = currentField?.fieldId === field.id;
              const missed =
                replayDone &&
                run &&
                !value &&
                skipSteps.some((s) => s.label.includes(field.label));
              return (
                <div
                  key={field.id}
                  className={`rounded-md border p-3 transition-colors duration-300 ${
                    isCurrent
                      ? 'border-[var(--accent)] bg-[var(--background)]'
                      : value
                        ? 'border-green-300 dark:border-green-900'
                        : 'border-[var(--border)]'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </p>
                  <p className="mt-1 min-h-[1.25rem] text-sm">
                    {value ? (
                      <span className="animate-rise-in inline-block">{value}</span>
                    ) : isCurrent ? (
                      animStyle === 'typewriter' && currentField?.detail ? (
                        <TypewriterText
                          text={currentField.detail}
                          durationMs={stepDelayMs}
                        />
                      ) : (
                        <span className="animate-pulse text-[var(--accent)]">
                          writing…
                        </span>
                      )
                    ) : missed ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        not found in document
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Field feed strip for PDF mode, where values can't be shown in place (Tier A). */}
      {selectedFormKind === 'pdf' && run && fieldSteps.length > 0 && (
        <footer className="border-t border-[var(--border)] px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto text-xs">
            {fieldSteps.slice(0, revealed).slice(-3).map((step) => (
              <span
                key={step.id}
                className="animate-rise-in shrink-0 rounded-full bg-[var(--background)] px-2 py-1 text-[var(--muted)]"
              >
                ✏️ {step.label.replace(/^Filling /, '')}
                {step.detail ? `: ${step.detail}` : ''}
              </span>
            ))}
            {isFilling && currentField && (
              <span className="shrink-0 rounded-full border border-[var(--accent)] px-2 py-1 text-[var(--accent)]">
                ✏️ {currentField.label.replace(/^Filling /, '')}:{' '}
                {animStyle === 'typewriter' && currentField.detail ? (
                  <TypewriterText
                    text={currentField.detail}
                    durationMs={stepDelayMs}
                  />
                ) : (
                  <span className="animate-pulse">…</span>
                )}
              </span>
            )}
            {replayDone && completedFile && (
              <span className="shrink-0 text-green-600 dark:text-green-400">
                ✓ {fieldSteps.length} fields filled
              </span>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
